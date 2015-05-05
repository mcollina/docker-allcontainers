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
  var names = {}
  var matchByName = toRegExp(opts.matchByName)
  var matchByImage = toRegExp(opts.matchByImage)
  var skipByImage = toRegExp(opts.skipByImage)
  var skipByName = toRegExp(opts.skipByName)

  result.destroy = function() {
    events.destroy()
  }

  events.pipe(through(function(chunk, enc, cb) {
    var data = JSON.parse(chunk)
    var container = docker.getContainer(data.id)
    var tries = 0

    function start() {
      if (++tries === 42) {
        // let's just skip this container
        // it means it started and died really fast
        // 42 is a magic number
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

        emit(current)
      })
    }

    switch (data.status) {
      case 'start':
        start()
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

      containers.forEach(emit)
    })
  }

  return result

  function emit(container) {
    if (skipByImage && container.Image.match(skipByImage)) {
      return
    }

    if (skipByName && container.Names[0].match(skipByName)) {
      return
    }

    if (matchByImage && !container.Image.match(matchByImage)) {
      return
    }

    if (matchByName && !container.Names[0].match(matchByName)) {
      return
    }

    if (!toEmit) {
      return
    }

    names[container.Id] = container
    result.emit('start', toEmit(container),
                docker.getContainer(container.Id))
  }

  function toEmit(container) {
    return {
      id: container.Id,
      image: container.Image,
      name: container.Names[0].replace(/^\//, '')
    }
  }
}

function toRegExp(obj) {
  if (!obj) {
    return null
  }

  if (obj instanceof RegExp) {
    return obj
  }

  return new RegExp(obj)
}

module.exports = allContainers

if (require.main === module) {
  (function() {
    var argv = require('minimist')(process.argv.slice(2))
    var ee = allContainers({
      matchByName: argv.matchByName,
      matchByImage: argv.matchByImage,
      skipByName: argv.skipByName,
      skipByImage: argv.skipByImage
    })
    ee.on('start', function(container) {
      console.log('started', container)
    })
    ee.on('stop', function(container) {
      console.log('stopped', container)
    })
  })()
}
