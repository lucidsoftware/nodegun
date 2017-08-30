#!/usr/bin/env node
import {ArgumentParser} from 'argparse';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import {CommandFactory} from './commandfactory';
import {MasterServer} from './cluster';
import {Server} from './server';

if (fs.existsSync(__filename.replace(/\.js$/, '.ts'))) {
    require('source-map-support').install();
}

const npmPackage = require('./package.json');

const parser = new ArgumentParser({description: 'Start Node.js server that supports the Nailgun protocol.', version: npmPackage.version});
const transport = parser.addMutuallyExclusiveGroup();
transport.addArgument(['--tcp'], {
    constant: '127.0.0.1:2113',
    help: 'TCP address to listen to, given as ip, port, or ip:port. IP defaults to 0.0.0.0, and port defaults to 2113. If no other transport is specified, TCP is used.',
    nargs: '?',
});
transport.addArgument(['--local'], {
    constant:'/tmp/nodegun.sock',
    help: 'Local address to listen to. Defaults to /tmp/nodegun.sock.',
    nargs:'?',
});
parser.addArgument(['--workers'], {
    constant:os.cpus().length,
    help: 'If present, number of worker processes to start. A flag with no argument starts one per CPU.',
    nargs:'?',
});
const args: {tcp:string|undefined, local:string|undefined, workers:number|undefined} = parser.parseArgs();

function listen(server: net.Server) {
    if (args.local) {
        server.listen(args.local);
    } else if (args.tcp) {
        const [first, second] = args.tcp.split(':', 2) as [string, string|undefined];
        if (second == null) {
            if (first.includes('.')) {
                server.listen(2113, first);
            } else {
                server.listen(first);
            }
        } else {
            server.listen(+first, second);
        }
    } else {
        server.listen(2113);
    }
}

// since Node.js sets SO_REUSEADDR for all AF_INET sockets, it seems consistent to reuse for AF_UNIX
if (args.local) {
    try {
        fs.unlinkSync(args.local);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }
}

let server;
if (!args.workers || args.workers <= 0) {
    server = new Server(new CommandFactory());
} else {
    server = new MasterServer(require.resolve('./worker.js'), args.workers);
}
listen(server.server);
