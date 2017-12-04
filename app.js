'use strict';

/*
 *
 *  Copyright 2016-2017 Red Hat, Inc, and individual contributors.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

// Setup logging
const winston = require('winston');
const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({level: 'info'})
  ]
});

const app = express();

// Health Check Middleware
const probe = require('kube-probe');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

let configMap;
let message;

app.use('/api/greeting', (request, response) => {
  const name = request.query ? request.query.name : 'World';

  if (!message) {
    response.status(500);
    return response.send({content: 'no config map'});
  }

  logger.debug('Replying to request, parameter={}', name);
  return response.send({content: message.replace(/%s/g, name)});
});

// set health check
probe(app);

// Periodic check for config map update
// If new configMap is found, then set new log level
setInterval(() => {
  retrieveConfigfMap().then((config) => {
    if (!config) {
      message = null;
      return;
    }

    if (JSON.stringify(config) !== JSON.stringify(configMap)) {
      configMap = config;
      message = config.message;

      // Set New log level
      if (logger.transports.console.level !== config.level.toLowerCase()) {
        logger.info('New configuration retrieved: {}', config.message);
        logger.info('New log level: {}', config.level.toLowerCase());
        logger.transports.console.level = config.level.toLowerCase();
      }
    }
  }).catch((err) => {
    logger.error('Error getting config', err);
  });
}, 2000);

// Get ConfigMap Stuff
const openshiftConfigLoader = require('openshift-config-loader');
const openshiftRestClient = require('openshift-rest-client');
const jsyaml = require('js-yaml');

// Find the Config Map
function retrieveConfigfMap () {
  return openshiftConfigLoader().then((config) => {
    const settings = {
      request: {
        strictSSL: false
      }
    };

    return openshiftRestClient(config, settings).then((client) => {
      const configMapName = 'app-config';
      return client.configmaps.find(configMapName).then((configMap) => {
        const configMapParsed = jsyaml.safeLoad(configMap.data['app-config.yml']);
        return configMapParsed;
      });
    });
  });
}

module.exports = app;
