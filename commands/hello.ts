import {Command} from '../command';

const command: Command = ({args, workingDirectory}, writer) => {
    writer.out(Buffer.from('Hello world\n'));
    for (const arg of args) {
        writer.out(Buffer.from(`Argument: ${arg}\n`));
    }
    writer.out(Buffer.from(`Working Directory: ${workingDirectory}`));
    writer.exit();
}

export = command;
