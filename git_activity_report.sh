#!/bin/bash

# Check if parameters were provided
if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "Usage: $0 YYYY-MM-DD [PROJECT_DIR]"
    exit 1
fi

DATE=$1
# If directory is not provided, use current directory
SCRIPT_DIR="${2:-$(pwd)}"

# Validate date format
if ! date -d "$DATE" >/dev/null 2>&1; then
    echo "Error: Invalid date format. Please use YYYY-MM-DD"
    exit 1
fi

# Validate directory exists
if [ ! -d "$SCRIPT_DIR" ]; then
    echo "Error: Directory does not exist: $SCRIPT_DIR"
    exit 1
fi

# Get the project name (last directory in path)
PROJECT_NAME=$(basename "$SCRIPT_DIR")

echo "Report for $DATE on $PROJECT_NAME"
echo

# Check if it's a git repository
if git -C "$SCRIPT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    # Get git user email for author filtering
    GIT_USER=$(git -C "$SCRIPT_DIR" config user.email)
    
    # Get branches with activity on the specified date
    BRANCHES=$(git -C "$SCRIPT_DIR" log --branches --format="%D" --author="$GIT_USER" --after="$DATE 00:00:00" --before="$DATE 23:59:59" | \
    grep -o 'origin/[^,)]*\|HEAD -> [^,)]*\|[^,)]*' | sort -u)

    # Only show branches section if there are active branches
    if [ ! -z "$BRANCHES" ]; then
        echo "Branches you've worked on:"
        echo "--------------------------"
        echo "$BRANCHES" | while read -r branch; do
            # Remove 'origin/' prefix and 'HEAD ->' prefix if present
            branch=$(echo "$branch" | sed 's/^origin\///' | sed 's/^HEAD -> //')
            if [ ! -z "$branch" ]; then
                echo "- $branch"
            fi
        done
        echo
    fi
    
    # Temporary file to store all changed files
    TEMP_FILE=$(mktemp)
    
    # Get committed changes
    git -C "$SCRIPT_DIR" log --name-only --pretty=format: --author="$GIT_USER" --after="$DATE 00:00:00" --before="$DATE 23:59:59" | sort -u > "$TEMP_FILE"
    
    # Get modified but not committed files from git status
    cd "$SCRIPT_DIR"
    # Get modified files
    git status --porcelain | grep '^.M' | cut -c4- | while read -r file; do
        if [ -f "$file" ]; then
            # Check if file was modified today
            if [ "$(date -r "$file" +%Y-%m-%d)" = "$DATE" ]; then
                echo "$file" >> "$TEMP_FILE"
            fi
        fi
    done
    # Get untracked files
    git status --porcelain | grep '^??' | cut -c4- | while read -r file; do
        if [ -f "$file" ]; then
            # Check if file was modified today
            if [ "$(date -r "$file" +%Y-%m-%d)" = "$DATE" ]; then
                echo "$file" >> "$TEMP_FILE"
            fi
        fi
    done
    
    # Remove duplicates and display results
    if [ -s "$TEMP_FILE" ]; then
        echo "Files you've worked on:"
        echo "-----------------------"
        sort -u "$TEMP_FILE" | while read -r file; do
            if [ -n "$file" ]; then
                echo "- $file"
            fi
        done
    else
        echo "No activity"
    fi
    
    # Clean up
    rm -f "$TEMP_FILE"
    
else
  
    # For non-git directories, use find
    CHANGED_FILES=$(find "$SCRIPT_DIR" -type f -not -path "*/\.*" -newermt "$DATE 00:00:00" ! -newermt "$DATE 23:59:59" 2>/dev/null)
    
    if [ -n "$CHANGED_FILES" ]; then
        echo "Files Changed:"
        echo "-------------"
        echo "$CHANGED_FILES" | while read -r file; do
            if [ -f "$file" ]; then
                relative_path=${file#$SCRIPT_DIR/}
                echo "- $relative_path"
            fi
        done
    else
        echo "No changes found"
    fi
fi