#!/usr/bin/env node

'use strict';

const github  = require( 'github' );
const util    = require( 'util' );

const config = require( '../config.json' );

const gh = new github( {
	version : '3.0.0'
} );

gh.authenticate( {
	type  : 'oauth',
	token : config.github.apiToken
} );

gh.repos.getCommits( {
	owner    : 'WordPress',
	repo     : 'wordpress-develop',
	per_page : 1,
}, ( err, commitsOfficial ) => {
	if ( err ) {
		throw err;
	}

	gh.repos.getCommits( {
		owner    : 'nylen',
		repo     : 'wordpress-develop-svn',
		per_page : 1,
	}, ( err, commitsMy ) => {
		if ( err ) {
			throw err;
		}

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

		gh.repos.edit( {
			owner       : 'nylen',
			name        : 'wordpress-develop-svn',
			repo        : 'wordpress-develop-svn',
			description : dateString + ' ' + descriptionMessage,
		}, ( err, result ) => {
			if ( err ) {
				throw err;
			}
			// console.log( result );
		} );
	} );
} );
