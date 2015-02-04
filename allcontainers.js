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

  result.destroy = function() {
    events.destroy()
  }

  events.pipe(through(function(chunk, enc, cb) {
    var data = JSON.parse(chunk)
    var container = docker.getContainer(data.id)
    var toEmit = {
      id: data.id,
      image: data.from
    }

    // normalize the data format
    data.Id = data.id
    data.Image = data.from

    switch (data.status) {
      case 'start':
        result.emit('start', toEmit, container)
        break
      case 'stop':
      case 'die':
        result.emit('stop', toEmit, container)
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
        result.emit('start', {
          id: container.Id,
          image: container.Image
        }, docker.getContainer(container.Id))
      })
    })
  }

  return result
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
