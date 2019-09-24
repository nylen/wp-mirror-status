#!/bin/sh

set -e # exit on error

(
	if ! flock -n 9; then
		echo "Failed to acquire lock" >&2
		exit 1
	fi

	cd /home/james/code/wordpress-develop-svn/

	git svn rebase > /dev/null
	git push origin master --quiet

	# This updates the description of this repository
	node /home/james/code/wp-mirror-status/bin/wp-mirror-status.js
) 9> /tmp/update-wordpress-develop-svn.lock
