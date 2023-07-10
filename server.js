const express = require('express');
const multer  = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const moment = require('moment');
const path = require('path');
const crypto = require('crypto');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname + '/index.html'));
});

app.post('/upload', upload.single('file'), (req, res) => {
  let results = [];
  let vehicles = {};
  let vehicleProcessed = false;
  let count = 0;
  let taskId = 1;  // Variable for task ID
  let stopId = 1;  // Variable for stop ID
  let tasks = [];  // Array to store all tasks for the single stop

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => {
      count++;
      
      // Ignore rows with blank visit location
      if (!data['Visit location (lat, lng)']) {
        return;
      }
      
      // Start processing from the third row
      if (count < 3) {
        return;
      }
      
      const vehicle = data['Vehicle index'];
      const task = "task_" + taskId; // Task ID
      taskId++; // Increment for next task
      const start = moment(data['Visit start']);
      const end = moment(data['Visit end']);
      const next = moment(data['Time to next stop'], 'HH:mm:ss');
      const latLng = data['Visit location (lat, lng)'].split(', ').map(Number);
      
      // Process only the first vehicle
      if (!vehicleProcessed) {
        vehicles[vehicle] = {
          vehicle: {
            vehicle_id: vehicle,
            start_location: {
              lat: latLng[0], // Pickup location as the start location
              lng: latLng[1],
              description: data['Vehicle label'],
            },
          },
          tasks: [],
          stops: [],
        };
        vehicleProcessed = true;
      } else if (vehicle !== Object.keys(vehicles)[0]) {
        return;
      }

      vehicles[vehicle].tasks.push({
        task_id: task, // use the new task ID
        tracking_id: data['Shipment label'],
        planned_waypoint: {
          lat: latLng[0],
          lng: latLng[1],
          description: data['Vehicle label'],
        },
        task_type: data['Visit type'].toUpperCase(),
        duration_seconds: end.diff(start, 'seconds'),
        planned_completion_time: end.toISOString(),
        planned_completion_time_range_seconds: next.diff(end, 'seconds'),
        contact_name: data['Vehicle label'],
      });
      
      // Store all tasks for the single stop
      tasks.push(task);
    })
    .on('end', () => {
      const stop = "stop_" + stopId; // Unique stop ID
      vehicles[Object.keys(vehicles)[0]].stops.push({
        stop_id: stop, // use the new stop ID
        planned_waypoint: {
          lat: vehicles[Object.keys(vehicles)[0]].vehicle.start_location.lat,
          lng: vehicles[Object.keys(vehicles)[0]].vehicle.start_location.lng,
          description: vehicles[Object.keys(vehicles)[0]].vehicle.start_location.description,
        },
        tasks: tasks, // Add all tasks to the single stop
      });
      
      const output = {
        manifests: Object.values(vehicles),
        description: '',
      };

      const filename = crypto.randomBytes(20).toString('hex') + '.json';
      fs.writeFileSync(path.join('public', filename), JSON.stringify(output, null, 2));
      res.send({ file: filename });
    });
});



app.use('/downloads', express.static(path.join(__dirname, 'public')));

app.listen(3000, () => console.log('Server started on port 3000'));