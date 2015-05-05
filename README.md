# docker-allcontainers

Get notified when a new container is started or stopped

## Install

```bash
npm install docker-loghose --save
```

## Usage

```js
var allContainer = require('docker-allcontainers')
var ee = allContainers({
  preheat: true, // emit starts event for all already running containers
  docker: null, // options to Dockerode
  matchByName: /hello/, // optional
  matchByImage: /matteocollina/, //optional
  skipByName: /.*pasteur.*/, //optional
  skipByImage: /.*dockerfile.*/ //optional
})
ee.on('start', function(meta, container) {
  // container is a Dockerode Container
  // see Dockerode API
  console.log('started', meta)
})
ee.on('stop', function(meta, container) {
  // container is a Dockerode Container
  // see Dockerode API
  console.log('stopped', meta)
})

// stop after 5 secs
setTimeout(function() {
  ee.destroy()
}, 5000)
```

## License

MIT
