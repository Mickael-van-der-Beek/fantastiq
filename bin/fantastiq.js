#! /usr/bin/env node

var fantastiq = require('..');
var Promise = require('bluebird');
var split = require('split');
var BatchStream = require('batch-stream');
var stream = require('stream');

var redis = require('redis');
Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

var optionRedis = {
  alias: 'redis',
  default: 'tcp://localhost:6379',
  describe: 'Redis connection',
  type: 'string'
};

function parseJob(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return String(raw);
  }
}

function createQueue(connectionParams) {
  var client = redis.createClient(connectionParams);
  var queue = fantastiq(client);
  return Promise.resolve(queue).disposer(function () {
    return client.endAsync();
  });
}

var argv = require('yargs')
  .usage('$0 <command> [options]')
  .option('r', optionRedis)
  .command('add', 'add a job to the queue', function (yargs) {
    var argv = yargs
      .usage('$0 add [options]')
      .option('r', optionRedis)
      .option('j', {
        alias: 'job',
        describe: 'Job to add',
        type: 'string'
      })
      .option('b', {
        alias: 'batch',
        describe: 'Batch size',
        default: 25
      })
      .option('p', {
        alias: 'priority',
        describe: 'Job priority, lower numbers are processed first',
        default: 0
      })
      .help('h')
      .alias('h', 'help')
      .argv;

    var jobs = null;
    if (typeof argv.j === 'string') {
      jobs = [argv.j];
    } else if (Array.isArray(argv.j)) {
      jobs = argv.j;
    }

    var options = {
      priority: argv.priority || 0
    };

    return Promise.using(createQueue(argv.redis), function (queue) {
      return Promise.fromCallback(function (callback) {
        var jobStream;

        if (jobs) {
          jobStream = new stream.Readable({
            objectMode: true,
            read: function() {
              var nextJob = jobs.length > 0 ? parseJob(jobs.shift()) : null;
              this.push(nextJob);
            }
          });
        } else {
          // read from stdin
          jobStream = process.stdin.pipe(split(parseJob, null));
        }

        var result = jobStream
          .pipe(new BatchStream({size: argv.batch}))
          .pipe(new stream.Transform({
            objectMode: true,
            transform: function(jobs, encoding, next) {
              queue.addN(jobs, options)
                .then(function (ids) {
                  next(null, ids.join('\n') + '\n');
                }, next);
            }
          }));

        result.pipe(process.stdout);

        result
          .on('error', callback)
          .on('end', function () {
            callback();
          });
      });
    });
  })
  .command('get', 'Get a job from the queue', function (yargs) {
    var argv = yargs
      .usage('$0 get <id>')
      .string('_')
      .demand(2)
      .option('r', optionRedis)
      .argv;

    var id = argv._[1];

    if (!id) {
      console.log('null');
      return;
    }

    return Promise.using(createQueue(argv.redis), function (queue) {
      return queue.get(id)
        .then(function (job) {
          return console.log(JSON.stringify(job, null, 2));
        });
    });
  })
  .help('h')
  .alias('h', 'help')
  .argv;