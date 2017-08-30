import * as childProcess from 'child_process';
import * as net from 'net';
import {ChunkParser, ChunkSerializer} from './chunk';
import {Ref} from './command';
import {Handler} from './handler';
import {CommandFactory} from './commandfactory';

export abstract class BaseServer {
    private readonly handler: Handler;

    constructor(commandFactory: CommandFactory, ref: Ref) {
        this.handler = new Handler(commandFactory, ref);
        process.on('beforeExit', () => ref.ref());
        process.on('uncaughtException', err => console.error(err.stack));
    }

    protected connection(socket: net.Socket) {
        socket.setNoDelay(true);
        socket.unref();
        const parser = new ChunkParser();
        const serializer = new ChunkSerializer();
        socket.pipe(parser);
        serializer.pipe(socket);

        this.handler.handle(parser, serializer);

        socket.on('timeout', () => socket.destroy(new Error('timeout')));
    }
}

export class Server extends BaseServer {
    public readonly server: net.Server;

    constructor(commandFactory: CommandFactory) {
        const server = net.createServer(socket => this.connection(socket));
        super(commandFactory, server);
        this.server = server;
        
    }
}
