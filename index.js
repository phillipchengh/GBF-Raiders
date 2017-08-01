require('dotenv').config();
let express = require( 'express' );
let twitter = require( 'twitter' );
let st = require( 'st' );
let app = express();
var helmet = require( 'helmet' );
let bodyParser = require( 'body-parser' );
let compression = require( 'compression' );
let morgan = require( 'morgan' );
let server = require( 'http' ).createServer( app );
let io = require( 'socket.io' ).listen( server );
let port = process.env.PORT || 80;
server.listen( port );

let client = new twitter( {
	consumer_key: process.env.consumer_key,
	consumer_secret: process.env.consumer_secret,
	access_token_key: process.env.access_token_key,
	access_token_secret: process.env.access_token_secret
} );

function TimedLogger( data ) {
	console.log( new Date().toString() + " - " + data );
}

let raidConfigs = require( './raids.json' );

app.set( 'json spaces', 0 );
app.use( helmet() );
app.use( morgan( 'combined' ) );
app.use( compression() );
app.use( bodyParser.json() );
app.use( bodyParser.urlencoded( {
	extended: true
} ) );

app.get( '/getraids', function ( req, res ) {
	res.header('Cache-Control', 'public, max-age=432000000');
	res.send( raidConfigs );
} );

app.use( st( {
	path: __dirname + '/static',
	url: '/',
	index: '/index.html',
	gzip: true,
	cache: {
		content: {
			max: 1024 * 1024 * 64, // how much memory to use on caching contents (bytes * kilo * mega)
			maxAge: 1000 * 60 * 60 * 24 * 7, // how long to cache contents for (milliseconds * seconds * minutes * hours * days)
		}
	},
	passthrough: false
} ) );

let keywords = "";

for ( let i = 0; i < raidConfigs.length; i++ ) {
	keywords += raidConfigs[ i ].english + "," + raidConfigs[ i ].japanese;
	if ( i != raidConfigs.length - 1 ) {
		keywords += ',';
	}
}

function searchTextForRaids( text ) {
	let result = "";
	for ( let i = 0; i < raidConfigs.length; i++ ) {
		if ( text.indexOf( raidConfigs[ i ].english ) != -1 || text.indexOf( raidConfigs[ i ].japanese ) != -1 ) {
			result = raidConfigs[ i ].room;
			break;
		}
	}
	return result;
}

function StartTwitterStream() {
	client.stream( 'statuses/filter', {
		track: keywords
	}, function ( stream ) {
		TimedLogger( "Twitter Stream started." );
		stream.on( 'data', function ( event ) {
			TimedLogger( "Tweet found." );
			let room = searchTextForRaids( event.text );
			var message = "No Twitter Message.";
			var language = "JP";
			var raidID = event.text.substr( event.text.indexOf( 'ID' ) + 3, 9 );
			if ( raidID.charAt( 0 ) == " " ) {
				raidID = raidID.substr( 1, 8 );
			} else {
				raidID = raidID.substr( 0, 8 );
			}
			if ( event.text.substr( 0, 10 ) !== "参加者募集！参戦ID" && event.text.substr( 0, 10 ) !== "I need bac" ) {
				if ( event.text.indexOf( '参戦ID' ) !== -1 ) {
					message = event.text.substring( 0, event.text.indexOf( '参戦ID' ) - 7 );
					language = "JP";
				} else if ( event.text.indexOf( 'Battle ID' ) !== -1 ) {
					message = event.text.substring( 0, event.text.indexOf( 'Battle ID' ) - 15 );
					language = "EN";
				}
			}
			var raidInfo = {
				id: raidID,
				user: "@" + event.user.screen_name,
				time: event.created_at,
				room: room,
				message: message,
				language: language,
				status: "unclicked"
			};
			TimedLogger( "Raid Info: " );
			console.dir( raidInfo );
			io.to( room ).emit( 'tweet', raidInfo );
		} );

		stream.on( 'error', function ( error ) {
			TimedLogger( "Twitter Stream error:" );
			console.dir( error );
			io.sockets.sockets.forEach( function ( s ) {
				s.disconnect( true );
			} );
			StartTwitterStream();
		} );
		stream.on( 'disconnect', function ( disconnect ) {
			TimedLogger( "Twitter Stream disconnect:" );
			console.dir( disconnect );
			StartTwitterStream();
		} );
		stream.on( 'warning', function ( warning ) {
			TimedLogger( "Twitter Stream warning:" );
			console.dir( warning );
		} );
	} );
}

io.sockets.on( 'connection', function ( socket ) {
	TimedLogger( "New connection established." );
	socket.on( 'subscribe',
		function ( data ) {
			TimedLogger( "Room subscribed: " + data.room );
			socket.join( data.room );
		} );

	socket.on( 'unsubscribe',
		function ( data ) {
			TimedLogger( "Room unsubscribed: " + data.room );
			socket.leave( data.room );
		} );
} );

TimedLogger( "Starting GBF Raiders on port " + port + "." );
StartTwitterStream();
