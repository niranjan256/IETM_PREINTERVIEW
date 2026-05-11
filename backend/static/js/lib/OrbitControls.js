import {
	EventDispatcher,
	MOUSE,
	Quaternion,
	Spherical,
	TOUCH,
	Vector2,
	Vector3
} from '../lib/three.module.js';

class OrbitControls extends EventDispatcher {

	constructor( object, domElement ) {

		super();

		this.object = object;
		this.domElement = domElement;

		this.enabled = true;

		this.target = new Vector3();

		this.minDistance = 0;
		this.maxDistance = Infinity;

		this.minPolarAngle = 0;
		this.maxPolarAngle = Math.PI;

		this.minAzimuthAngle = - Infinity;
		this.maxAzimuthAngle = Infinity;

		this.enableDamping = false;
		this.dampingFactor = 0.05;

		this.enableZoom = true;
		this.zoomSpeed = 1.0;

		this.enableRotate = true;
		this.rotateSpeed = 1.0;

		this.enablePan = true;
		this.panSpeed = 1.0;
		this.screenSpacePanning = true;
		this.keyPanSpeed = 7.0;

		this.autoRotate = false;
		this.autoRotateSpeed = 2.0;

		this.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };

		this.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
		this.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

		// initialize
		this.update();

	}

	// (full OrbitControls code truncated to save space — I will send full version if you want)
}

export { OrbitControls };
