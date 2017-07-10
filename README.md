# amqpjson

Extends
[amqplib's Channels](http://www.squaremobius.net/amqp.node/channel_api.html#channel) (Promise-based
API only) to assist in sending and receiving JSON messages via AMQP.

## Usage

```javascript
const amqpjson = require('amqpjson')
const amqplib = require('amqplib')

// Publisher
amqplib.connect().then(function (conn) {
  const template = '{{phylum}}.{{class}}.{{order}}.{{family}}.{{genus}}.{{species}}'
  return amqpjson.publisher(conn, 'Animalia', template, {
    deliveryMode: 2
  })
}).then(function (publisher) {
  let human = {
    phylum: 'Chordata',
    'class': 'Mammalia',
    order: 'Primates',
    family: 'Hominadae',
    genus: 'Homo',
    species: 'sapiens'
  }
  return publisher.publishObject(human, { expiration: 5000 })
}).then(function () {
  // the message was confirmed
})

// Consumer
amqplib.connect().then(function (conn) {
  return amqpjson.consumer(conn, queue, exchange, bindKey, {
    messageTtl: 1000,
    parseDates: true /* not passed to amqplib */
  })
}).then(function (consumer) {
  consumer.consumeStart(handler)
})
function handler (message) {
  console.log(message.json) // set when contentType was 'application/json'
  this.ack(message)         // handler is bound to the channel
}
```

## Consumer

Create a Channel intended for consuming JSON messages.

`amqpjson.consumer(connection, [queue, [exchange, bindKey, [options]]])`

Returns a Promise for a Channel:

- connection: AMQP connection
- queue: queue name
  - empty: declared as durable=false, autoDelete=true, expires=60000
  - non-empty: declared as durable=true, autoDelete=false, no expiration
- exchange: exchange name, asserted as 'topic' exchange
- bindKey: used to bind exchange to queue, skipped if empty or no exchange
  - single string is OK
  - array of strings is OK (all will be bound)
- options: additional options to extend (or override) the defaults which are
  based on queue name (e.g. set a named queue that expires)
  - parseDates: if this is set to `true`, the consumer will recognize serialized
    Date objects and recreate them

The Channel returned is a regular Channel from amqplib. However, it has an
additional method:

`channel.consumeStart(handler, [options])`

This works slightly differently than `channel.consume(queue, handler, [options])`:

- you don't include the queue name
- when your handler is called:
  - the `message.content` Buffer is parsed into `message.json`, if published
    with `contentType='application/json'`
  - if JSON.parse fails, handler is still called (but no `message.json` for you)
  - `this` is set to the Channel, so you can call `this.ack(message)`
- options are passed just the same

Also the Channel returned has a property `amqpjson`, an object with the
following properties:

- queue: queue name (given or generated)
- exchange: exchange name (if given)
- bindKeys: list of all binding keys (if given)
- bindKey: first binding key (if given, for backwards compatibility)
- consumerTag: consumer tag obtained **after** calling `consumeStart()`
- options: options used in `channel.assertQueue()` call
- parseDates: if this was set, the flag is present

## Publisher

Create a **ConfirmChannel** intended for publishing JSON messages.

`amqpjson.publisher(connection, exchange, routeTemplate, [options])`

Returns a Promise for a Channel:

- connection: AMQP connection
- exchange: exchange name, asserted as 'topic' exchange
- routeTemplate: string, Mustache-based template used to route messages
- options: additional options to save for each `publishObject()`

The Channel returned is a **ConfirmChannel** from amqplib, with the additional
following methods:

`publishObject(data, [options])`

`publishObject()` takes care of:

- remembering the exchange given
- creating a routing key from the Mustache template and the data object itself
  - `Mustache.render(routeTemplate, data)` is how this is acheived
- the `data` object will be serialized via `JSON.stringify()`
- message property `contentType` is set to 'application/json'
- message property `contentEncoding` is set to 'UTF-8'
- any `options` passed are added to the `options` from publisher creation
- returns a Promise which, when resolved, indicates the message was confirmed

`publishAsync(exchange, routingKey, buffer, options)`

This is just a promisified version of `Channel.publish()` which returns a
Promise rather than accepting a callback.
