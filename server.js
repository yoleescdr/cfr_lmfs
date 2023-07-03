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
  const results = [];
  const vehicles = {};

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => {
      const vehicle = data['Vehicle index'];
      const task = data['Shipment index'];
      const start = moment(data['Visit start']);
      const end = moment(data['Visit end']);
      const next = moment(data['Time to next stop'], 'HH:mm:ss');
      const latLng = data['Visit location (lat, lng)'].split(', ').map(Number);

      if (!vehicles[vehicle]) {
        vehicles[vehicle] = {
          vehicle: {
            vehicle_id: vehicle,
            start_location: {
              lat: latLng[0],
              lng: latLng[1],
              description: data['Vehicle label'],
            },
          },
          tasks: [],
          stops: [],
        };
      }

      vehicles[vehicle].tasks.push({
        task_id: task,
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

      vehicles[vehicle].stops.push({
        stop_id: data['Visit label'],
        planned_waypoint: {
          lat: latLng[0],
          lng: latLng[1],
          description: data['Vehicle label'],
        },
        tasks: [task],
      });
    })
    .on('end', () => {
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
