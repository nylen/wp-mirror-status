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
			const buildStatusMessage = '| build: ' + ( build && build.result === 0 ? '🐸' : '💔' );

			const fullMessage = [
				dateString,
				descriptionMessage,
				buildStatusMessage,
			].join( ' ' );

			gh.repos.update( {
				owner       : 'nylen',
				repo        : 'wordpress-develop-svn',
				description : fullMessage,
				homepage    : buildUrl,
			} ).then( result => {
				console.log( fullMessage );
				// console.log( result );
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
