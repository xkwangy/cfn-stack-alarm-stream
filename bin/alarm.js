#!/usr/bin/env node

var _ = require('underscore');
var Alarms = require('..');
var env = require('superenv')('cfn');
var optimist = require('optimist');
var colors = require('colors');

var alarms = new Alarms(env.accessKeyId, env.secretAccessKey);

var argv = optimist
    .options('region', {
        describe: 'AWS region where AutoScaling Group exists',
        demand: true,
        alias: 'r'
    })
    .options('name', {
        describe: 'Name of the AWS AutoScaling Group to cycle',
        demand: true,
        alias: 'n'
    })
    .argv;

if (argv.help) return optimist.showHelp();

alarms.getStackAlarms(argv.region, argv.name, function(err, result) {
    if (err) throw err;
    alarms.getAllAlarmState(argv.region, result, function(err, states) {
        if (err) throw err;
        _(states).each(function(state) {
            if (state.state === 'OK' || state.state === 'INSUFFICIENT_DATA') {
                console.log("%s: %s Threshold: %s".green,
                  state.name,
                  state.value,
                  state.threshold);
            } else {
                console.log("%s: %s Threshold: %s".red,
                  state.name,
                  state.value,
                  state.threshold);
            }
        });
    });
});
