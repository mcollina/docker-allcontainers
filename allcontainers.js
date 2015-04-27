#! /usr/bin/env node

var nes = require('never-ending-stream')
var Docker = require('dockerode')
var through = require('through2')
var EE = require('events').EventEmitter

function allContainers (opts) {
  opts = opts || {}

  var docker = new Docker(opts.docker)
  var result = new EE()
  var events = nes(function(cb) {
        docker.getEvents(cb)
      })
  var names   = {}

  result.destroy = function() {
    events.destroy()
  }

  events.pipe(through(function(chunk, enc, cb) {
    var data = JSON.parse(chunk)
    var container = docker.getContainer(data.id)
    var tries = 0

    function emitStart() {
      if (++tries === 42) {
        // let's just skip this container
        // it means it started and died really fast
        return
      }

      // weird hack because dockerode does not
      // offer a way to fetch the name of our container
      docker.listContainers(function(err, containers) {
        if (err) {
          return result.emit('error', err)
        }

        var current = containers.filter(function(container) {
          return container.Id === data.id
        })[0]

        // we are polling the docker API really fast
        if (!current) {
          return setTimeout(emit, 20)
        }

        names[data.id] = current

        result.emit('start', toEmit(names[data.id]), container)
      })
    }

    switch (data.status) {
      case 'start':
        emitStart()
        break
      case 'stop':
      case 'die':
        if (names[data.id]) {
          // we need to know this container
          result.emit('stop', toEmit(names[data.id]), container)
          delete names[data.id]
        }  // otherwise we already emitted stop
        break
      default:
      // do nothing, really
    }

    cb()
  }))

  // preheat is the default
  if (opts.preheat !== false) {
    docker.listContainers(function(err, containers) {
      if (err) {
        return result.emit('error', err)
      }

      containers.forEach(function(container) {
        names[container.Id] = container
        result.emit('start', toEmit(container),
                    docker.getContainer(container.Id))
      })
    })
  }

  return result

  function toEmit(container) {
    return {
      id: container.Id,
      image: container.Image,
      name: container.Names[0].replace(/^\//, '')
    }
  }
}

module.exports = allContainers

if (require.main === module) {
  (function() {
    var ee = allContainers()
    ee.on('start', function(container) {
      console.log('started', container)
    })
    ee.on('stop', function(container) {
      console.log('stopped', container)
    })
  })()
}
