bMoor.make('bmoor.component.Plugin', [
	function(){
		'use strict';

		function override( key, target, plugin ){
			var action = plugin[key],
				old = target[key];
			
			if ( bMoor.isFunction(action) ){
				if ( old === undefined || bMoor.isFunction(old) ){
					target[key] = function(){
						var backup = plugin.$wrapped,
							rtn;

						plugin.$wrapped = function(){
							old.apply( target, arguments );
						};

						rtn = action.apply( plugin, arguments );

						plugin.$wrapped = backup;

						return rtn;
					};
				}else{
					throw 'attempting to plug-n-play '+key+' an instance of '+typeof(old);
				}
			}else{
				throw 'attempting to plug-n-play with '+key+' and instance of '+typeof(action);
			}
		}

		return {
			construct : function Plugin(){
				throw 'You neex to extend Plugin, no instaniating it directly';
			},
			properties : {
				_target : function( target ){
					var key;

					for( key in this ){
						if ( key.charAt(0) !== '_' ){
							override( key, target, this );
						}
					}
				}
			}
		};
	}]
);