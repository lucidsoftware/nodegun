# Nodegun

Nailgun for Node.js

## Motivation

Node.js is fast...eventually. Its startup time is substaintal.

```
$ time node -e 'console.log("Hello world")'
Hello world

real    0m0.102s
```

Larger programs are worse

```js
// typescript.js
const ts = require('typescript');
const code = 'export const example = 1;';
const result = ts.transpileModule(code, {});
console.log(code.result);
```

```
$ time node typescript.js
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.example = 1;

real    0m0.470s
```

Nodegun reduces that overhead to low milliseconds.

```
$ time ng helloworld.js
Hello world

real    0m0.003s
```


```
$ time ng typescript.js
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.example = 1;

real    0m0.011s
```

## Nailgun

Java is plauged by a similar problem. [Nailgun](http://www.martiansoftware.com/nailgun/) is a system that avoides startup overhead of Java programs. A small executable (written in C) to connects to a long-running Java server.

Nodegun re-uses the Nailgun client and protocol, but with Node.js for the server.

## Getting started

1. Install the nailgun client, either from [source](https://github.com/martylamb/nailgun) or from your package manager. E.g. for Ubuntu,

```sh
apt-get install nailgun
```

2. Install and run nodegun.

```sh
npm install -g nodegun
nodegun
```

3. Create a "nail" -- a program that can runs in the long-lived Node.JS process.

```js
// example_nail.js
modules.exports = (context, writer) => {
    writer.out(Buffer.from(context.args.join('-')));
};
```

4. Run the client 

```sh
# or ng-nailgun 
ng /home/bob/example_nail.js The Fast and the Furious
```

```
The-Fast-and-the-Furious
```

## Options

```
usage: nodegun [-h] [-v] [--tcp [TCP] | --local [LOCAL]] [--workers [WORKERS]]

Start Node.js server that supports the Nailgun protocol.

Optional arguments:
  -h, --help           Show this help message and exit.
  -v, --version        Show program's version number and exit.
  --tcp [TCP]          TCP address to listen to, given as ip, port, or 
                       ip:port. IP defaults to 0.0.0.0, and port defaults to 
                       2113. If no other transport is specified, TCP is used.
  --local [LOCAL]      Local address to listen to. Defaults to /tmp/nodegun.
                       sock.
  --workers [WORKERS]  If present, number of worker processes to start. A 
                       flag with no argument starts one per CPU.
```