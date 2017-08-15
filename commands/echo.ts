import {Command} from '../command';

const command: Command = ({}, writer) => {
    return {
        next(data: Buffer) {
            writer.out(Buffer.from(data));
        },
        end() {
            writer.exit();
        }
    }
};

export = command;
