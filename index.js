var _ = require('underscore');
var AWS = require('aws-sdk');
var queue = require('queue-async');

var api = function(accessKeyId, secretAccessKey) {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    return this;
};

module.exports = api;

api.prototype.getStackAlarms = function(region, stackName, callback) {
    var cfn = new AWS.CloudFormation({
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
        region: region
    });
    var cloudwatch = new AWS.CloudWatch({
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
        region: region
    });
    cfn.describeStackResources({StackName: stackName}, function(err, data) {
        if (err) return callback(err);
        var alarms = _(data.StackResources).filter(function(resource) {
            return resource.ResourceType === 'AWS::CloudWatch::Alarm';
        });
        var q = queue();
        _(alarms).each(function(alarm) {
            q.defer(function(next) {
                cloudwatch.describeAlarms({AlarmNames: [alarm.PhysicalResourceId]},
                  function(err, data) {
                      next(err, data);
                  });
            });
        });
        q.awaitAll(function(err, results) {
            if (err) return callback(err);
            results = _(results).reduce(function(memo, result) {
                var details = result.MetricAlarms.pop();
                // Hack - don't care about autoscaling alarms
                _(details.AlarmActions).each(function(action) {
                    if (action.split(':')[2] !== 'autoscaling') {
                        memo.push(details);
                        return memo;
                    }
                });
                return memo;
            }, []);
            callback(null, results);
        });
    });
};

api.prototype.getAlarmState = function(region, alarm, callback) {
    var cloudwatch = new AWS.CloudWatch({
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
        region: region
    });
    var params = {
      StartTime: new Date(new Date().getTime() - (alarm.Period * 2e3)).toISOString(),
      EndTime: new Date().toISOString(),
      Namespace: alarm.Namespace,
      Statistics: [alarm.Statistic],
      MetricName: alarm.MetricName,
      Period: alarm.Period,
      Dimensions: alarm.Dimensions
    };
    cloudwatch.getMetricStatistics(params, function(err, data) {
        if (err) throw err;
        var metric = {
          name: alarm.MetricName,
          threshold:alarm.Threshold
        };
        if (!data.Datapoints.length) {
            metric.value = null;
            metric.state = 'INSUFFICIENT_DATA';
        } else {
            // Get the newest result
            var latest = _(data.Datapoints).reduce(function(memo, datapoint) {
                var timestamp = Date.parse(datapoint.Timestamp);
                if (!memo.Timestamp || timestamp > memo.Timestamp) return datapoint;
                else return memo;
            }, {});
            metric.value = latest[alarm.Statistic];
            metric.time = latest.Timestamp;
            metric.unit = latest.Unit;
            metric.state = compare(
              alarm.ComparisonOperator,
              metric.value,
              metric.threshold) ?
                'ALARM' : 'OK';
        }
        callback(null, metric);
    });
};

api.prototype.getAllAlarmState = function(region, alarms, callback) {
    var that = this;
    var q = queue();
    _(alarms).each(function(alarm) {
        q.defer(function(next) {
            that.getAlarmState(region, alarm, function(err, data) {
                next(err, data);
            });
        });
    });
    q.awaitAll(function(err, results) {
        if (err) return callback(err);
        callback(err, results);
    });
};

function compare(comparator, value, threshold) {
    switch(comparator) {
        case 'GreaterThanOrEqualToThreshold':
            return value >= threshold;
        case 'GreaterThanThreshold':
            return value > threshold;
        case 'LessThanThreshold':
            return value < threshold;
        case 'LessThanOrEqualToThreshold':
            return value <= threshold;
    }
}
