'use strict'

const Promise = require('bluebird')
const Mustache = require('mustache')
const assign = require('lodash.assign')

function route (tpl, view) {
  let rk = Mustache.render(tpl, view)
  return rk.replace(/^\.+|\.(?=\.)|\.+$/g, '')
}

function consumer (amqp, queue, exchange, bindings, options) {
  let ch
  let info = {}
  return Promise.try(function () {
    return amqp.createChannel()
  }).then(function (channel) {
    ch = channel
    let opts = {durable: !!queue, autoDelete: !queue}
    if (!queue) { opts.expires = 60000 }
    if (options) { assign(opts, options) }
    info.options = opts
    return ch.assertQueue(queue, opts)
  }).then(function (q) {
    info.queue = q.queue
    if (!exchange) { return }
    return ch.assertExchange(exchange, 'topic').then(function (ex) {
      info.exchange = ex.exchange
    })
  }).then(function () {
    if (!info.exchange || !bindings) { return }
    if (typeof bindings === 'string') { bindings = [bindings] }
    return Promise.map(bindings, (bk) => {
      return ch.bindQueue(info.queue, info.exchange, bk)
    }).then(() => {
      info.bindKey = bindings[0] // compat
      info.bindKeys = bindings
    })
  }).then(function () {
    ch.consumeStart = function (handler, opts) {
      const cb = handleJsonMessage.bind(ch, handler.bind(ch))
      return ch.consume(info.queue, cb, opts).then(function (sub) {
        info.consumerTag = sub.consumerTag
        return sub
      })
    }
  }).then(function () {
    ch.amqpjson = info
    return ch
  })
}

function handleJsonMessage (handler, message) {
  if (/^application\/json/.test(message.properties.contentType)) {
    try {
      message.json = JSON.parse(message.content.toString())
    } catch (err) {}
  }
  return handler(message)
}

function publisher (amqp, exchange, tpl, opts) {
  let ch
  return Promise.try(function () {
    return amqp.createConfirmChannel()
  }).then(function (channel) {
    ch = channel
    ch.publishAsync = Promise.promisify(ch.publish, {context: ch})
    return ch.assertExchange(exchange, 'topic')
  }).then(function (ex) {
    opts = assign({}, opts || {}, {
      contentType: 'application/json',
      contentEncoding: 'UTF-8'
    })
    ch.publishObject = publishObject.bind(ch, exchange, tpl, opts)
    return ch
  })
}

function publishObject (exchange, tpl, options, obj, moreOpts) {
  return Promise.try(() => {
    let rk = route(tpl, obj)
    let buff = new Buffer(JSON.stringify(obj))
    if (moreOpts) { options = assign({}, options, moreOpts) }
    return this.publishAsync(exchange, rk, buff, options)
  })
}

exports.route = route
exports.consumer = consumer
exports.publisher = publisher
