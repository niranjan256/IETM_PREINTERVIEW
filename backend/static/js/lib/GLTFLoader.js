import {
	AnimationClip,
	AnimationMixer,
	Color,
	Loader,
	Group
} from '../lib/three.module.js';

class GLTFLoader extends Loader {

	constructor( manager ) {
		super( manager );
	}

	load( url, onLoad, onProgress, onError ) {

		const loader = new Loader();
		loader.load( url, ( data ) => {

			const gltf = JSON.parse( data );
			onLoad( gltf );

		}, onProgress, onError );

	}

}

export { GLTFLoader };
