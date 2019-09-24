#!/usr/bin/env node

'use strict';

const https = require( 'https' );
const util  = require( 'util' );

const github = require( '@octokit/rest' );

const config = require( '../config.json' );

// https://github.com/nodejs/node/issues/17871 :(
process.on( 'unhandledRejection', err => {
	console.error( 'Unhandled promise rejection:', err );
	process.exit( 1 );
} );

const gh = new github( {
	version : '3.0.0',
	auth    : config.github.apiToken,
} );

gh.repos.listCommits( {
	owner    : 'WordPress',
	repo     : 'wordpress-develop',
	per_page : 1,
} ).then( commitsOfficial => {

	gh.repos.listCommits( {
		owner    : 'nylen',
		repo     : 'wordpress-develop-svn',
		per_page : 1,
	} ).then( commitsMy => {

		const getRevision = commit => {
			if ( ! commit ) {
				throw new Error( 'Missing commit' );
			}
			const match = commit.commit.message.match(
				/git-svn-id: https:\/\/develop\.svn\.wordpress\.org\/trunk@(\d+)/
			);
			if ( match ) {
				return +match[ 1 ];
			} else {
				return 0;
			}
		};

		const revisionOfficial = getRevision( commitsOfficial.data[ 0 ] );
		const revisionMy       = getRevision( commitsMy.data[ 0 ] );

		let descriptionMessage;
		if ( revisionOfficial > revisionMy ) {
			descriptionMessage = util.format(
				'😞 This repository is %d revision%s behind https://github.com/WordPress/wordpress-develop',
				revisionOfficial - revisionMy,
				( revisionOfficial - revisionMy === 1 ? '' : 's' )
			);
		} else if ( revisionMy > revisionOfficial ) {
			descriptionMessage = util.format(
				'😞 https://github.com/WordPress/wordpress-develop is %d revision%s behind this repository',
				revisionMy - revisionOfficial,
				( revisionMy - revisionOfficial === 1 ? '' : 's' )
			);
		} else {
			descriptionMessage = (
				'✨ This repository is up to date with https://github.com/WordPress/wordpress-develop'
			);
		}

		const dateString = new Date().toISOString()
			.replace( /(T\d\d:\d\d).*Z$/, '$1Z' );

		const travisUrl = 'https://api.travis-ci.org/repos/nylen/wordpress-develop-svn/builds';
		httpsRequest( travisUrl, ( err, builds ) => {
			if ( err ) {
				throw err;
			}

			const build = builds.find( b => b.state === 'finished' );
			// console.log( build.message );

			httpsRequest( travisUrl + '/' + build.id, ( err, build ) => {
				if ( err ) {
					throw err;
				}

				// PHP 7.3 with Memcached fails on my fork
				// "docker: Error response from daemon: network
				// wordpress-develop_wpdevnet not found."
				// https://travis-ci.org/nylen/wordpress-develop-svn/jobs/588751819
				const buildOk = build.matrix.every( job => {
					// console.log( {
					// 	result: job.result,
					// 	allow_failure: job.allow_failure,
					// 	name: job.config.name,
					// 	env: job.config.env,
					// } );
					return (
						job.result === 0 ||
						job.allow_failure ||
						/\bLOCAL_PHP_MEMCACHED=true\b/.test( job.config.env || '' )
					);
				} );

				const buildStatusMessage = (
					'| build: '
					+ ( buildOk ? '🐸' : '💔' )
				);

				const fullMessage = [
					dateString,
					descriptionMessage,
					buildStatusMessage,
				].join( ' ' );

				const buildUrl = (
					'https://travis-ci.org/nylen/wordpress-develop-svn/builds/'
					+ build.id
				);

				gh.repos.update( {
					owner       : 'nylen',
					repo        : 'wordpress-develop-svn',
					description : fullMessage,
					homepage    : buildUrl,
				} ).then( result => {
					console.log( fullMessage );
					// console.log( result );
				} );

				if ( buildOk && build.result !== 0 ) {
					// Overwrite the Travis CI commit status
					// https://webapps.stackexchange.com/a/78518/17972
					gh.repos.listStatusesForRef( {
						owner : 'nylen',
						repo  : 'wordpress-develop-svn',
						ref   : build.commit,
					} ).then( result => {
						if (
							result.data &&
							result.data.length &&
							result.data[0].state === 'error'
						) {
							gh.repos.createStatus( {
								owner       : 'nylen',
								repo        : 'wordpress-develop-svn',
								sha         : build.commit,
								context     : 'continuous-integration/travis-ci/push',
								state       : 'success',
								target_url  : buildUrl,
								description : 'The Travis CI build completed except for some errors that are almost certainly irrelevant (docker fail)',
							} ).then( result => {
								console.log( 'Updated build status:', result.status );
							} );
						}
					} );
				}
			} );
		} );
	} );
} );

const httpsRequest = ( url, cb ) => {
	https.get( url, res => {
		if ( res.statusCode !== 200 ) {
			cb( new Error( 'HTTP ' + res.statusCode ) );
			return;
		}
		let data = '';
		res.on( 'data', d => data += d );
		res.on( 'end', () => {
			try {
				data = JSON.parse( data );
				cb( null, data );
			} catch ( err ) {
				cb( err );
			}
		} );
	} );
};
