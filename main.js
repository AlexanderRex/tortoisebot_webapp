var app = new Vue({
    el: '#app',
    data: {
        connected: false,
        ros: null,
        logs: [],
        loading: false,
        rosbridge_address: 'wss://i-059a60c586ce20b99.robotigniteacademy.com/9c2b5b52-4125-463e-b3f5-c6170ee43d8c/rosbridge/',
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
        // 3D stuff
        viewer: null,
        tfClient: null,
        urdfClient: null,
        // Action
        goal: null,
        action: {
            goal: { position: { x: 0, y: 0, z: 0 } },
            feedback: { position: { x: 0, y: 0 }, state: 'idle' },
            result: { success: false },
            status: { text: 'Idle' }
        },
        goals: [
            { position: { x: 0.67, y: -0.5, z: 0.0 } },
            { position: { x: 0.67, y: 0.5, z: 0.0 } },
            { position: { x: 0.2, y: 0.5, z: 0.0 } },
            { position: { x: 0.2, y: 0.03, z: 0.0 } },
            { position: { x: -0.13, y: 0.0, z: 0.0 } },
            { position: { x: -0.13, y: -0.45, z: 0.0 } },
            { position: { x: -0.45, y: -0.45, z: 0.0 } },
            { position: { x: -0.17, y: 0.5, z: 0.0 } },
            { position: { x: -0.66, y: 0.5, z: 0.0 } },
        ],
        selectedGoal: null
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
                this.setup3DViewer()
                this.setCamera()

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
                this.unset3DViewer()
                document.getElementById('divCamera').innerHTML = ''
            });
        },
        disconnect: function() {
            this.goal = null
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
        setup3DViewer() {
            this.viewer = new ROS3D.Viewer({
                background: '#cccccc',
                divID: 'div3DViewer',
                width: 400,
                height: 300,
                antialias: true,
                fixedFrame: 'odom'
            })

            // Add a grid.
            this.viewer.addObject(new ROS3D.Grid({
                color:'#0181c4',
                cellSize: 0.5,
                num_cells: 20
            }))

            // Setup a client to listen to TFs.
            this.tfClient = new ROSLIB.TFClient({
                ros: this.ros,
                angularThres: 0.01,
                transThres: 0.01,
                rate: 10.0
            })

            // Setup the URDF client.
            this.urdfClient = new ROS3D.UrdfClient({
                ros: this.ros,
                param: 'robot_description',
                tfClient: this.tfClient,
                // We use "path: location.origin + location.pathname"
                // instead of "path: window.location.href" to remove query params,
                // otherwise the assets fail to load
                path: location.origin + location.pathname,
                rootObject: this.viewer.scene,
                loader: ROS3D.COLLADA_LOADER_2
            })
        },
        unset3DViewer() {
            document.getElementById('div3DViewer').innerHTML = ''
        },
        setCamera: function() {
            let without_wss = this.rosbridge_address.split('wss://')[1]
            console.log(without_wss)
            let domain = without_wss.split('/')[0] + '/' + without_wss.split('/')[1]
            console.log(domain)
            let host = domain + '/cameras'
            let viewer = new MJPEGCANVAS.Viewer({
                divID: 'divCamera',
                host: host,
                width: 320,
                height: 240,
                topic: '/camera/image_raw',
                ssl: true,
            })
        },
        sendGoal: function() {
            let actionClient = new ROSLIB.ActionClient({
                ros : this.ros,
                serverName : '/tortoisebot_as',
                actionName : 'course_web_dev_ros/WaypointActionAction'
            })

            this.goal = new ROSLIB.Goal({
                actionClient : actionClient,
                goalMessage: {
                    position: this.selectedGoal.position
                }
            })

            this.goal.on('status', (status) => {
                this.action.status = status
            })

            this.goal.on('feedback', (feedback) => {
                this.action.feedback = feedback
            })

            this.goal.on('result', (result) => {
                this.action.result = result
            })

            this.goal.send()
        },
        cancelGoal: function() {
            this.goal.cancel()
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
