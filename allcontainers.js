#! /usr/bin/env node
'use strict'
var nes = require('never-ending-stream')
var Docker = require('dockerode')
var through = require('through2')
var fastJsonParse = require('fast-json-parse')
var Split = require('split2')
var EE = require('events').EventEmitter

function parseJson (chunk) {
  var parsed = fastJsonParse(chunk)
  if (parsed.err) {
    return undefined
  } else {
    return parsed.value
  }
}

function allContainers (opts) {
  opts = opts || {}

  var docker = new Docker(opts.docker)
  var result = new EE()
  var split = Split(parseJson)
  var events = nes(function(cb) {
    docker.getEvents(cb)
  })
  var names = {}
  var matchByName = toRegExp(opts.matchByName)
  var matchByImage = toRegExp(opts.matchByImage)
  var skipByImage = toRegExp(opts.skipByImage)
  var skipByName = toRegExp(opts.skipByName)
  var pausedPreheatContainers = {};

  result.destroy = function() {
    events.destroy()
  }

  events.pipe(split).on('data', function(data) {
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
          return setTimeout(start, 20)
        }

        emit(current)
      })
    }

    function emitStop() {
      result.emit('stop', toEmit(names[data.id]), container)
      delete names[data.id]
    }

    switch (data.status) {
      case 'unpause':
        if (pausedPreheatContainers[data.id]) {
          delete pausedPreheatContainers[data.id];
          start();
        }
        break;
      case 'restore':
      case 'start':
        start()
        break
      case 'stop':
      case 'die':
        // we need to know this container
        // otherwise we already emitted stop
        if (names[data.id]) {
          emitStop()
        }
        break
      case 'checkpoint':
        // there's no way to actually know if the container is alive or not without inspecting...
        if (names[data.id]) {
          container.inspect(function(err, info) {
            if (!info.State.Running) {
              emitStop()
            }
          })
        }
        break
      default:
      // do nothing, really
    }
  })

  // preheat is the default
  if (opts.preheat !== false) {
    docker.listContainers(function(err, containers) {
      if (err) {
        return result.emit('error', err)
      }

      var activeContainers = [];
      function findPausedContainers(container) {
        if (container.Status.indexOf("Paused") !== -1) {
          pausedPreheatContainers[container.Id] = container;
        } else {
          activeContainers.push(container);
        }
      }

      containers.forEach(findPausedContainers)
      activeContainers.forEach(emit)
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
