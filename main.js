var app = new Vue({
    el: '#app',
    data: {
        connected: false,
        ros: null,
        logs: [],
        loading: false,
        rosbridge_address: 'wss://i-0f2158b952d843088.robotigniteacademy.com/0d7d80eb-a4d1-4d48-9851-6dcba1e7dfe0/rosbridge/',
        port: '9090',
        mapViewer: null,
        mapGridClient: null,
        interval: null,
        dragging: false,
        x: 'no',
        y: 'no',
        dragCircleStyle: {
            margin: '0px',
            top: '0px',
            left: '0px',
            display: 'none',
            width: '75px',
            height: '75px',
        },
        joystick: {
            vertical: 0,
            horizontal: 0,
        },
        pubInterval: null,
    },
    methods: {
        connect: function() {
            this.loading = true;
            this.ros = new ROSLIB.Ros({
                url: this.rosbridge_address
            });
            this.ros.on('connection', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Connected!');
                this.connected = true;
                this.loading = false;

                // Initialize map viewer
                this.mapViewer = new ROS2D.Viewer({
                    divID: 'map',
                    width: 420,
                    height: 360
                });

                // Setup the map client
                this.mapGridClient = new ROS2D.OccupancyGridClient({
                    ros: this.ros,
                    rootObject: this.mapViewer.scene,
                    continuous: true,
                });

                // Scale the canvas to fit the map
                this.mapGridClient.on('change', () => {
                    this.mapViewer.scaleToDimensions(
                        this.mapGridClient.currentGrid.width,
                        this.mapGridClient.currentGrid.height
                    );
                    this.mapViewer.shift(
                        this.mapGridClient.currentGrid.pose.position.x,
                        this.mapGridClient.currentGrid.pose.position.y
                    );
                });

                // Start joystick publisher
                this.pubInterval = setInterval(this.publishJoystickData, 100);
            });
            this.ros.on('error', (error) => {
                this.logs.unshift((new Date()).toTimeString() + ` - Error: ${error}`);
            });
            this.ros.on('close', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Disconnected!');
                this.connected = false;
                this.loading = false;
                document.getElementById('map').innerHTML = '';
                clearInterval(this.pubInterval);
            });
        },
        disconnect: function() {
            if (this.ros) {
                this.ros.close();
            }
        },
        publishJoystickData: function() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            });
            let message = new ROSLIB.Message({
                linear: { x: this.joystick.vertical, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: this.joystick.horizontal }
            });
            topic.publish(message);
        },
        startDrag: function() {
            this.dragging = true;
            this.x = this.y = 0;
        },
        stopDrag: function() {
            this.dragging = false;
            this.x = this.y = 'no';
            this.dragCircleStyle.display = 'none';
            this.resetJoystickVals();
        },
        doDrag(event) {
        if (this.dragging) {
            
            let ref = document.getElementById('dragstartzone');
            let rect = ref.getBoundingClientRect();

            let x = event.clientX - rect.left;
            let y = event.clientY - rect.top;

            let radius = ref.offsetWidth / 2;
            let centerX = radius;
            let centerY = radius;
            let dx = x - centerX;
            let dy = y - centerY;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > radius) {
                let angle = Math.atan2(dy, dx);
                x = centerX + radius * Math.cos(angle);
                y = centerY + radius * Math.sin(angle);
            }

            this.dragCircleStyle.display = 'inline-block';
            this.dragCircleStyle.top = `${y - parseInt(this.dragCircleStyle.height) / 2}px`;
            this.dragCircleStyle.left = `${x - parseInt(this.dragCircleStyle.width) / 2}px`;

            this.joystick.vertical = -1 * ((y / (2 * radius)) - 0.5);
            this.joystick.horizontal = -((x / (2 * radius)) - 0.5);
            }
        },
        setJoystickVals: function() {
            this.joystick.vertical = -1 * ((this.y / 200) - 0.5);
            this.joystick.horizontal = -1 * ((this.x / 200) - 0.5);
        },
        resetJoystickVals: function() {
            this.joystick.vertical = 0;
            this.joystick.horizontal = 0;
        },
    },
    mounted() {
        // Set an interval to keep the connection alive
        this.interval = setInterval(() => {
            if (this.ros != null && this.ros.isConnected) {
                this.ros.getNodes((data) => {}, (error) => {});
            }
        }, 10000); // Check every 10 seconds
        window.addEventListener('mouseup', this.stopDrag);
    },
});
