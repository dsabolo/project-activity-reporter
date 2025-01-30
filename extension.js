/* extension.js */
'use strict';

const { St, GObject, Gio, GLib, Clutter, Pango } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ByteArray = imports.byteArray;
const ModalDialog = imports.ui.modalDialog;
const ExtensionUtils = imports.misc.extensionUtils;

let activityReporter = null;

// Activity Report Window
const ActivityReportWindow = GObject.registerClass(
    class ActivityReportWindow extends ModalDialog.ModalDialog {
        _init(projectPath) {
            super._init({
                destroyOnClose: true
            });

            this.projectPath = projectPath;
            this.currentDate = new Date();
            this.projectName = GLib.basename(projectPath);

            // Create container for the report
            let content = new St.BoxLayout({
                vertical: true,
                style_class: 'activity-report-content'
            });

            // Header with title and navigation
            let header = new St.BoxLayout({
                style_class: 'activity-report-header',
                y_align: Clutter.ActorAlign.CENTER
            });

            // Previous day button
            this.prevButton = new St.Button({
                label: '←',
                style_class: 'activity-nav-button',
                y_align: Clutter.ActorAlign.CENTER
            });
            this.prevButton.connect('clicked', () => this._changeDate(-1));

            // Title box
            let titleBox = new St.BoxLayout({
                style_class: 'activity-title-box',
                y_align: Clutter.ActorAlign.CENTER
            });

            // Project name and date in one line
            let titleLine = new St.BoxLayout({
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true
            });

            this.projectLabel = new St.Label({
                text: this.projectName,
                style_class: 'activity-project-label',
                y_align: Clutter.ActorAlign.CENTER
            });

            this.dateLabel = new St.Label({
                text: this._formatDate(this.currentDate),
                style_class: 'activity-date-label',
                y_align: Clutter.ActorAlign.CENTER
            });

            titleLine.add(this.projectLabel);
            titleLine.add(new St.Label({ 
                text: ' - ',
                y_align: Clutter.ActorAlign.CENTER
            }));
            titleLine.add(this.dateLabel);
            titleBox.add(titleLine);

            // Next day button
            this.nextButton = new St.Button({
                label: '→',
                style_class: 'activity-nav-button',
                visible: false,
                y_align: Clutter.ActorAlign.CENTER
            });
            this.nextButton.connect('clicked', () => this._changeDate(1));

            // Add header elements
            header.add(this.prevButton);
            header.add(titleBox);
            header.add(this.nextButton);

            // Report content
            let reportContent = new St.BoxLayout({
                vertical: true,
                style_class: 'activity-report-content'
            });

            this.reportBox = new St.BoxLayout({
                vertical: true,
                style_class: 'activity-report-box'
            });

            reportContent.add(this.reportBox);

            // Copy button container
            let buttonBox = new St.BoxLayout({
                style_class: 'activity-button-box',
                x_align: Clutter.ActorAlign.CENTER
            });

            let copyButton = new St.Button({
                style_class: 'activity-nav-button',
                child: new St.Icon({
                    icon_name: 'edit-copy-symbolic',
                    style_class: 'popup-menu-icon'
                })
            });

            copyButton.connect('clicked', () => {
                let reportText = '';
                let children = this.reportBox.get_children();
                for (let child of children) {
                    if (child instanceof St.ScrollView) {
                        let box = child.get_child();
                        if (box) {
                            let labels = box.get_children();
                            for (let label of labels) {
                                if (label instanceof St.Label) {
                                    reportText += label.get_text() + '\n';
                                }
                            }
                        }
                    }
                }

                if (reportText) {
                    let clipboard = St.Clipboard.get_default();
                    clipboard.set_text(St.ClipboardType.CLIPBOARD, reportText);
                    clipboard.set_text(St.ClipboardType.PRIMARY, reportText);

                    // Show copy confirmation
                    let notification = new St.Label({
                        style_class: 'activity-notification',
                        text: '✓ Copied to clipboard'
                    });
                    buttonBox.insert_child_at_index(notification, 0);

                    // Remove notification after 2 seconds
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                        buttonBox.remove_child(notification);
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });

            buttonBox.add(copyButton);
            reportContent.add(buttonBox);

            // Add everything to the container
            content.add(header);
            content.add(reportContent);

            // Add close button
            this.addButton({
                label: 'Close',
                action: () => this.close(),
                key: Clutter.KEY_Escape
            });

            // Add content to dialog
            this.contentLayout.add(content);

            // Load initial report
            this._loadReport();
            this._updateNextButtonVisibility();
        }

        _formatDate(date) {
            return date.toISOString().split('T')[0];
        }

        _isToday(date) {
            const today = new Date();
            return date.getDate() === today.getDate() &&
                   date.getMonth() === today.getMonth() &&
                   date.getFullYear() === today.getFullYear();
        }

        _updateNextButtonVisibility() {
            this.nextButton.visible = !this._isToday(this.currentDate);
        }

        _changeDate(days) {
            this.currentDate.setDate(this.currentDate.getDate() + days);
            this.dateLabel.text = this._formatDate(this.currentDate);
            this._updateNextButtonVisibility();
            this._loadReport();
        }

        _loadReport() {
            // Clear current report
            this.reportBox.destroy_all_children();

            // Get the extension directory
            let extension = ExtensionUtils.getCurrentExtension();
            let scriptPath = GLib.build_filenamev([extension.path, 'git_activity_report.sh']);
            let dateStr = this._formatDate(this.currentDate);

            log(`Loading report from ${scriptPath} for date ${dateStr} and path ${this.projectPath}`);

            try {
                let [success, stdout, stderr, exitStatus] = GLib.spawn_command_line_sync(
                    `bash "${scriptPath}" "${dateStr}" "${this.projectPath}"`
                );

                if (!success || exitStatus !== 0) {
                    log(`Error running script: ${ByteArray.toString(stderr)}`);
                }

                if (success && exitStatus === 0) {
                    let text = '';
                    try {
                        text = ByteArray.toString(stdout).trim();
                    } catch (e) {
                        text = stdout.toString().trim();
                    }

                    if (text) {
                        let monitor = Main.layoutManager.primaryMonitor;
                        let minHeight = Math.floor(monitor.height * 0.6);

                        let report = new St.ScrollView({
                            style_class: 'activity-report-scroll',
                            style: `min-height: ${minHeight}px;`
                        });
                        
                        let reportBox = new St.BoxLayout({
                            vertical: true,
                            x_expand: true,
                            y_expand: true,
                            style_class: 'activity-report-box'
                        });

                        let reportText = new St.Label({
                            text: text,
                            style_class: 'activity-report-text'
                        });

                        reportBox.add(reportText);
                        report.add_actor(reportBox);
                        this.reportBox.add(report);
                    } else {
                        let noActivity = new St.Label({
                            text: 'No activity found for this date',
                            style_class: 'activity-report-text'
                        });
                        this.reportBox.add(noActivity);
                    }
                } else {
                    let errorText = '';
                    try {
                        errorText = ByteArray.toString(stderr).trim();
                    } catch (e) {
                        errorText = stderr.toString().trim();
                    }

                    let error = new St.Label({
                        text: 'Error generating report: ' + errorText,
                        style_class: 'activity-report-error'
                    });
                    this.reportBox.add(error);
                }
            } catch (e) {
                let error = new St.Label({
                    text: 'Error running report script: ' + e.toString(),
                    style_class: 'activity-report-error'
                });
                this.reportBox.add(error);
            }
        }
    }
);

// Show Folder Dialog
const ShowFolderDialog = GObject.registerClass({
    Signals: { 'folder-selected': { param_types: [GObject.TYPE_STRING] } }
}, class ShowFolderDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({
            destroyOnClose: true
        });

        let content = new St.BoxLayout({
            style_class: 'folder-dialog-content',
            vertical: true
        });

        this._entry = new St.Entry({
            style_class: 'folder-dialog-entry',
            hint_text: 'Enter folder path...',
            can_focus: true
        });
        content.add_child(this._entry);

        this.contentLayout.add_child(content);

        this.addButton({
            label: 'Cancel',
            action: () => {
                this.close();
            },
            key: Clutter.KEY_Escape
        });

        this.addButton({
            label: 'Add',
            action: () => {
                let path = this._entry.get_text();
                if (path) {
                    this.emit('folder-selected', path);
                }
                this.close();
            }
        });
    }
});

const ProjectActivityReporter = GObject.registerClass(
    class ProjectActivityReporter extends PanelMenu.Button {
        _init() {
            super._init(0);

            let icon = new St.Icon({
                icon_name: 'x-office-document-symbolic',
                style_class: 'system-status-icon'
            });
            this.add_child(icon);

            this._settings = {
                directories: new Set()
            };

            let addProjectBtn = new PopupMenu.PopupMenuItem('+ Add Project');
            addProjectBtn.connect('activate', () => {
                let dialog = new ShowFolderDialog();
                dialog.connect('folder-selected', (dialog, folder) => {
                    this._addDirectory(folder);
                });
                dialog.open();
            });
            this.menu.addMenuItem(addProjectBtn);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this.projectsSection = new PopupMenu.PopupMenuSection();
            this.menu.addMenuItem(this.projectsSection);

            this._loadSettings();
            this._refreshProjectList();
        }

        _addDirectory(path) {
            path = path.replace(/\/+$/, '');
            if (!this._settings.directories.has(path)) {
                this._settings.directories.add(path);
                this._saveSettings();
                this._refreshProjectList();
            }
        }

        _refreshProjectList() {
            this.projectsSection.removeAll();

            for (let path of this._settings.directories) {
                let projectName = GLib.basename(path);
                let item = new PopupMenu.PopupMenuItem(projectName);
                
                let removeIcon = new St.Icon({
                    icon_name: 'edit-delete-symbolic',
                    style_class: 'popup-menu-icon'
                });
                let removeBtn = new St.Button({
                    child: removeIcon,
                    style_class: 'remove-button'
                });
                removeBtn.connect('clicked', () => {
                    this._settings.directories.delete(path);
                    this._saveSettings();
                    this._refreshProjectList();
                });
                
                item.add_child(removeBtn);
                item.connect('activate', () => {
                    let reportWindow = new ActivityReportWindow(path);
                    reportWindow.open();
                });
                
                this.projectsSection.addMenuItem(item);
            }

            if (this._settings.directories.size === 0) {
                let noProjectsItem = new PopupMenu.PopupMenuItem('No projects added', {
                    reactive: false,
                    style_class: 'no-projects-label'
                });
                this.projectsSection.addMenuItem(noProjectsItem);
            }
        }

        _saveSettings() {
            let json = JSON.stringify(Array.from(this._settings.directories));
            let bytes = new GLib.Bytes(json);
            let path = GLib.build_filenamev([GLib.get_user_config_dir(), 'project-activity-reporter']);
            GLib.mkdir_with_parents(path, 0o755);
            let file = Gio.File.new_for_path(GLib.build_filenamev([path, 'directories.json']));
            file.replace_contents(bytes.toArray(), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        }

        _loadSettings() {
            try {
                let path = GLib.build_filenamev([GLib.get_user_config_dir(), 'project-activity-reporter', 'directories.json']);
                let file = Gio.File.new_for_path(path);
                let [success, contents] = file.load_contents(null);
                if (success) {
                    let json = new TextDecoder().decode(contents);
                    this._settings.directories = new Set(JSON.parse(json));
                }
            } catch (e) {
                this._settings.directories = new Set();
            }
        }
    }
);

function init() {
    return null;
}

function enable() {
    activityReporter = new ProjectActivityReporter();
    Main.panel.addToStatusArea('project-activity-reporter', activityReporter);
}

function disable() {
    activityReporter?.destroy();
    activityReporter = null;
}
