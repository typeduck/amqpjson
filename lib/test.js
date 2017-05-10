/* eslint-env mocha */
'use strict'

require('should')
const Promise = require('bluebird')
const AMQP = require('amqplib')
const lib = require('../')

describe('amqp-json', function () {
  let amqp
  before(function () {
    return Promise.try(function () {
      return AMQP.connect()
    }).then(function (conn) { amqp = conn })
  })
  after(function () {
    return Promise.try(function () { return amqp.close() })
  })
  it('should create a consumer for temporary queue', function () {
    return Promise.try(function () {
      return lib.consumer(amqp)
    }).then(function (ch) {
      ch.should.have.property('amqpjson')
      ch.amqpjson.should.have.property('queue')
      return ch.deleteQueue(ch.amqpjson.queue)
    })
  })
  it('should create a consumer for a named queue', function () {
    return Promise.try(function () {
      return lib.consumer(amqp, 'test-queue')
    }).then(function (ch) {
      let info = ch.amqpjson
      info.should.have.property('queue')
      info.queue.should.equal('test-queue')
      return ch.deleteQueue(ch.amqpjson.queue)
    })
  })
  it('should create consumer bound to exchange', function () {
    return lib.consumer(amqp, '', 'Foo', 'foo').then(function (ch) {
      let info = ch.amqpjson
      info.should.have.property('queue')
      info.should.have.property('exchange')
      info.should.have.property('bindKey')
      return Promise.try(function () {
        return ch.unbindQueue(info.queue, info.exchange, info.bindKey)
      }).then(function () {
        return [
          ch.deleteQueue(info.queue),
          ch.deleteExchange(info.exchange)
        ]
      }).spread(function () {
      })
    })
  })
  it('should be able to combine publisher/consumer', function (done) {
    let cleanup
    let exName = 'amqp-json-' + (new Date().getTime())
    function getCleanup (consumer, publisher) {
      return function () {
        return Promise.try(function () {
          return [
            consumer.deleteExchange(exName),
            consumer.deleteQueue(consumer.amqpjson.queue)
          ]
        }).spread(function () {
          return [consumer.close(), publisher.close()]
        }).spread(function () { return null })
      }
    }
    function handler (msg) {
      msg.should.have.property('json')
      msg.json.should.eql({b: {c: 'bee'}, c: 'sea', d: 'die'})
      cleanup().then(done)
    }
    Promise.try(function () {
      return [
        lib.consumer(amqp, '', exName, '*.bee.*'),
        lib.publisher(amqp, exName, 'a.{{b.c}}.d')
      ]
    }).spread(function (consumer, publisher) {
      return consumer.consumeStart(handler).then(function () {
        cleanup = getCleanup(consumer, publisher)
        return publisher.publishObject({b: {c: 'bee'}, c: 'sea', d: 'die'})
      })
    })
  })
})
