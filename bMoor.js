

(function( $, global, undefined ){
	"use strict";
	
	var
		environmentSettings = {
			runWindow : 300,       // 0 implies to run everything immediately
			runPause  : 30,        // how long to pause between intervals to prevent the window from locking up
			jsRoot    : ''
		};
	
	function time(){
		return ( new Date() ).getTime();
	}
	
	function error( str ){
		if ( console && console.log ){
			console.log( str );
		}
	}
	
	// Defines 
	var Bouncer = {
		stacks      : {},
		readyStacks : {},
		locks       : {},
		pauseAfter  : {},
		onEmpty     : {},
		fullEmpty   : null
	};
	
	(function(){
		// set up some private static variables
		var
			stacks = [],
			pauseAfter = null,
			activeStack = null;
		
		// set up some private functions
		function resetTime(){
			pauseAfter = time() + environmentSettings.runWindow;
		}
		
		function releaseLock( stack ){
			// this means you were the first lock to return, so adjust the next pause position
			if ( this.locks[stack] == pauseAfter ){
				resetTime();
			}
			
			delete this.locks[stack];
			this.run( stack );
		}
		
		Bouncer.add = function( stack, op, front ){
			// action, arguments, target, delay
			if ( !this.stacks[stack] ){
				stacks++;
				this.stacks[stack] = [];
			}
			
			this.stacks[(front ? 'unshift' : 'push')]({
				action    : ( typeof(op) == 'function' ? op : op.action ),
				arguments : ( op.arguments ? op.arguments : [] ),
				target    : ( op.target ? op.target : (typeof(op) == 'function' ? op : op.action) ),
				delay     : ( op.delay ? op.delay : false )
			});
		};
		
		Bouncer.onEmpty = function( stack, func, args ){
			if ( stack ){
				if ( this.stacks[stack] && this.stacks[stack].length > 0 ){
					this.onEmpty[stack] = function(){
						func( args );
					};
				}else{
					func( args );
				}
			}else{
				if ( stacks.length > 0 ){
					this.fullEmpty = function(){
						func( args );
					};
				}else{
					func( args );
				}
			}
		};
		
		// run a stack if it is not already locked
		Bouncer.run = function(){
			var
				dis = this,
				stack;
		
			if ( activeStack == null ){
				if ( stacks.length == 0 ){
					return;
				}else{
					activeStack = stacks.shift();
				}
			}
			
			stack = activeStack;
			
			if ( this.stacks[stack] && this.stacks[stack].length && this.locks[stack] == undefined ){
				if ( environmentSettings.runWindow == 0 ){
					// if no run window, just run everything as it comes in
					var
						op = this.stacks[stack].shift();
					
					op.action.apply( op.target, op.arguments );
					releaseLock.call( dis, stack );
				}else{
					var
						op = this.stacks[stack].shift();
					
					if ( pauseAfter == null ){
						resetTime();
					}
					
					this.pauseAfter[stack] = pauseAfter;
					this.locks[stack] = true;
					
					op.target.runNext = function(){
						op.target.runNext = function(){}; // no double taps
						// TODO : I could do something that if runNext never gets called I force it, but maybe for v2
						if ( time() > dis.pauseAfter[stack] ){
							setTimeout( function(){
								releaseLock.call( dis, stack );
							}, environmentSettings.runPause );
						}else{
							releaseLock.call( dis, stack );
						}
					};
					
					op.action.apply( op.target, op.arguments );
					
					if ( !op.delay ){
						op.target.runNext();
					}
				}
			}else if ( !this.stacks[stack] || this.stacks[stack].length == 0 ){
				// handle when a stack runs out
				delete this.stacks[stack];
				
				if ( this.onEmpty[stack] ){
					this.onEmpty[stack]();
					delete this.onEmpty[stack];
				}
				
				if ( stacks.length == 0 ){
					if ( this.fullEmpty ){
						this.fullEmpty();
						delete this.fullEmpty;
					}
					
					activeStack = null;
				}else{
					activeStack = stacks.shift();
				}
			}
		};
	}());
	
	var Namespace = {
		// TODO I would love to be able to cache the last search
		parse : function( space ){
			if ( typeof(space) == 'string' ){
				return space.split('.'); // turn strings into an array
			}else return space.slice(0);
		},
		get : function( space ){
			var 
				curSpace = global;
			
			space = this.parse( space );
			
			for( var i = 0; i < space.length; i++ ){
				var
					nextSpace = space[i];
					
				if ( !curSpace[nextSpace] ){
					curSpace[nextSpace] = {};
				}
				
				curSpace = curSpace[nextSpace];
			}
			
			return curSpace;
		},
		exists : function( space ){
			var 
				curSpace = global;
			
			space = this.parse( space );
			
			for( var i = 0; i < space.length; i++ ){
				var
					nextSpace = space[i];
					
				if ( !curSpace[nextSpace] ){
					return false;
				}
				
				curSpace = curSpace[nextSpace];
			}
			
			return true;
		}
	};
	
	var FileLoader = {};
	(function(){
		// A multi level hash that allows for different libraries to be located in different locations
		var
			libRoots = {};
			
		FileLoader.resetLibrary = function(){
			libRoots = {
				'/' : environmentSettings.jsRoot
			};
		};
		
		/** 
		 * set the location of a library
		 * 
		 * @var {array,string} className The class to set up a path to
		 * @var {string} path The URL path to the library's base
		 */
		FileLoader.setLibrary = function( className, path, settings, catchAll ){
			var
				lib = libRoots,
				classPath = Namespace.parse( className );
			
			if ( !settings ){
				settings = {};
			}
			
			while( classPath.length ){
				var
					dir = classPath.shift();
				
				if ( lib[ dir ] == undefined ){
					lib[ dir ] = {};
				}
				lib = lib[ dir ];
			}
			
			lib['/'] = path;
			lib['.'] = settings;
			lib['*'] = catchAll == true; // type caste
		};
		
		FileLoader.delLibrary = function( className ){
			var
				lib = libRoots,
				prevLib = null,
				prevDir = null,
				classPath = Namespace.parse( className );
			
			while( classPath.length && lib ){
				var
					dir = classPath.shift();
				
				if ( lib[dir] ){
					prevLib = lib;
					prevDir = dir;
					
					lib = lib[ prevDir ];
				}else{
					lib = null;
				}
			}
			
			if ( lib ){
				delete prevLib[ prevDir ];
			}
		};
		
		FileLoader.getLibrary = function( className ){
			var
				lib = libRoots,
				masterLib = libRoots,
				classPath = Namespace.parse( className ),
				masterPath = classPath.slice(0);
			
			while( classPath.length ){
				var
					dir = classPath[0];
				
				if ( lib[dir] ){
					lib = lib[ classPath.shift() ];
					
					if ( lib['/'] ){
						masterLib = lib;
						masterPath = classPath.slice(0);
					}
				}else{
					break;
				}
			}
			
			return masterLib['*'] 
				? { root : masterLib['/'], path : [],         settings : masterLib['.'] } 
				: { root : masterLib['/'], path : masterPath, settings : masterLib['.'] };
		};
		
		FileLoader.loadClass = function( className, callback, args, target ){
			var
				classPath = Namespace.parse( className );

			if ( !Namespace.exists(classPath) ){
				var
					info = this.getLibrary( classPath ),
					success = function( script, textStatus ){
						var 
							obj = Namespace.get(classPath);
						
						if ( obj ){
							// obj can be delayed installed
							var
								whenReady = function (){
									if ( callback ){
										if ( target == undefined ){
											target = {};
										}
									
										if ( args == undefined ){
											args = [];
										}
									
										callback.apply( target, args );
									}
								};
							
							// is this an object that is getting loaded via bMoor or just a different class?
							// wait to call the callback until the class is really loaded, so store this request up
							if ( obj.prototype.__delayedInstall ){
								obj.prototype.__delayedInstall( whenReady );
							}else{
								whenReady();
							}
							
						}else{
							error( 'loaded file : '+script+"\n but no class : "+classPath.join('.') );
						}
					},
					path = info.root + ( info.path.length ? '/'+info.path.join('/') : '' );

				$.getScript( path+'.js' )
					.done( success )
					.fail( function(){
						$.getScript( path+'.min.js' )
							.done( success )
							.fail( function( jqxhr, settings, exception ){
								error( 'failed to load file : '+path+"\nError : "+exception );
							});
					});
			}
		};
		
		FileLoader.require = function( requirements, callback, args, reference ){
			var
				reqCount = 1;
			
			function cb(){
				reqCount--;
				
				if ( reqCount == 0 ){
					// now all requirements are loaded
					
					reqCount--; // locks any double calls, requests to -1
					
					callback.apply( reference, args );
				}
			}
			
			if ( !reference ){
				reference = {};
			}
			
			if ( !args ){
				args = [];
			}
			
			// build up the request stack
			for( var i = 0, req = requirements, len = req ? req.length : 0; i < len; i++ ){
				var
					namespace = Namespace.parse( req[i] );

				// if namespace does not exist, load it
				if ( !Namespace.exists(namespace) ){
					reqCount++;
					this.loadClass( namespace, cb );
				}
			}
			
			cb();
		};
	}());
	FileLoader.resetLibrary();
	
	function Constructor(){}
	(function(){
		var
			classesLoading = 0,
			onLoaded = [];
		
		Constructor.prototype.onLoaded = function( cb, args ){
			if ( classesLoading == 0 ){
				cb.apply( this, args );
			}else{
				onLoaded.push({
					callback  : cb,
					arguments : args
				});
			}
		};
		/**
		 * 
		 * @param settings 
		 * {
		 *   name        : the name of the class
		 *   namespace   : the namespace to put the class into
		 *   require     : classes to make sure are loaded before class is defined
		 *   parent      : the parent to extend the prototype of, added to require
		 *   aliases     : the local renaming of classes prototypes for faster access
		 *   construct   : the constructor for the class, called automatically
		 *   publics     : the public interface for the class
		 *   statics     : variables to be shared between class instances
		 * }
		 */
		Constructor.prototype.create = function( settings, callback, args ){
			var
				dis = this,
				requests = settings.requests,
				namespace = ( settings.namespace ? Namespace.get(settings.namespace) : global ),
				obj  = namespace[ settings.name ] = function(){
					this.__construct.apply( this, arguments );
				}; 
			
			// callback used each time a new class is pulled in
			
			classesLoading++;
			obj.prototype.__construct = settings.construct 
				? settings.construct
				: function(){};
			
			obj.prototype.__delayedInstalls = [];
			obj.prototype.__delayedInstall = function( cb ){
				this.__delayedInstalls.push( cb );
			};
			
			if ( !requests ){
				 requests = [];
			}
			
			if ( settings.parent ){
				requests.push( settings.parent );
			}
			
			if ( settings.aliases ){
				for( var namespace in settings.aliases ){ requests.push( namespace ); }
			}
			
			FileLoader.require( requests, function(){
				classesLoading--;
				define.call( dis, settings, obj );
				
				if ( callback ){
					callback.apply( callback, args | [] );
				}
			}, [], this);
		};
		
		// passing in obj as later I might configure it to allow you to run this against an already defined class
		function define( settings, obj ){
			var
				parent = ( settings.parent ? Namespace.get(settings.parent) : null );
			
			if ( !settings.name ){
				throw 'Need name for class';
			}
			
			// inheret from the parent
			if ( parent ){
				this.extend( obj, parent );
			}
			
			// define any aliases
			if ( settings.aliases ){
				this.alias( obj, settings.aliases );
			}
			
			// right now, i am making it static on the prototype level, so __parent.__static might be neccisary
			this.statics( obj, settings.statics );
			
			if ( settings.publics ){
				this.publics( obj, settings.publics );
			}
			
			// run through any delays, clean up the prototype
			for( var i = 0, installs = obj.prototype.__delayedInstalls, len = installs.length; i < len; i++ ){
				installs[i]();
			}
			delete obj.prototype.__delayedInstalls;
			delete obj.prototype.__delayedInstall;
			
			if ( classesLoading == 0 ){
				for( var i = 0, len = onLoaded.length; i < len; i++ ){
					onLoaded[i].callback.apply( this, onLoaded[i].arguments ); 
				}
			}
		};
		
		Constructor.prototype.publics = function( child, publics ){
			for( var name in publics ){
				child.prototype[name] = publics[name];
			}
		};
		
		Constructor.prototype.statics = function( child, statics ){
			if ( statics ){
				child.prototype.__statics = statics;
			}else{
				child.prototype.__statics = {};
			}
		};
		
		Constructor.prototype.alias = function( child, aliases ){
			for( var namespace in aliases ){
				var
					alias = aliases[namespace];
				
				child.prototype['__'+alias] = Namespace.get(namespace).prototype;
			}
		};
		
		// used to extend a child instance using the parent's prototype
		Constructor.prototype.extend = function( child, parent ){
			var 
				proto = child.prototype,
				_proto = parent.prototype,
				_parent = { constructor : parent.prototype.constructor };
			
			child.prototype.__parent = _proto;
			
			for( var attr in _proto ){
				if ( proto[attr] ){
					_parent[attr] = _proto[attr];
				}else{
					proto[attr] = _proto[attr];
				}
			}
		};
	}());
	
	global.bMoor = {
		settings    : environmentSettings,
		fileloader  : FileLoader,
		constructor : new Constructor()
	};
	
}( jQuery, this ));