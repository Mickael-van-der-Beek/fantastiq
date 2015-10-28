'use strict';

var redis = require('redis');
var Queue = require('../lib/Queue');
var assert = require('chai').assert;
var sinon = require('sinon');

describe('Queue._runDelayedCycle', function () {

  var client = redis.createClient({
    host: process.env.REDIS_HOST
  });
  var queue = new Queue('test', client);
  var clock = null;

  beforeEach(function (done) {
    return client.flushall(done);
  });

  afterEach(function () {
    if (clock) {
      clock.restore();
      clock = null;
    }
  });

  it('should move delayed jobs when delay expires', async function () {
    var now = Date.now();
    clock = sinon.useFakeTimers(now);
    var id = await queue.add(1, { runAt: now + 1000 });

    clock.tick(999);
    var activatedCount = await queue._runDelayedCycle();
    assert.strictEqual(activatedCount, 0);

    var job = await queue.get(id);
    assert.propertyVal(job, 'state', 'delayed');

    var stats = await queue.stat();
    assert.propertyVal(stats, 'totalCount', 1);
    assert.propertyVal(stats, 'delayedCount', 1);

    var retrieval = await queue.retrieve();
    assert.isNull(retrieval.id);

    clock.tick(2);
    activatedCount = await queue._runDelayedCycle();
    assert.strictEqual(activatedCount, 1);

    job = await queue.get(id);
    assert.propertyVal(job, 'state', 'inactive');

    retrieval = await queue.retrieve();
    assert.propertyVal(retrieval, 'id', id);
  });

  it('should preserve priority', async function () {
    var now = Date.now();
    clock = sinon.useFakeTimers(now);
    var id1 = await queue.add(1, { priority: 10, runAt: now + 1000 });
    var id2 = await queue.add(1, { priority: 0, runAt: now + 1000 });

    clock.tick(1001);
    await queue._runDelayedCycle();

    var retrieval = await queue.retrieve();
    assert.propertyVal(retrieval, 'id', id2);

    retrieval = await queue.retrieve();
    assert.propertyVal(retrieval, 'id', id1);
  });

});
