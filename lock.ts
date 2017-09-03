export class NamedLock {
    private queue: ([string, () => Promise<void>])[] = [];

    acquire(name: string, action: () => Promise<void>) {
        if (this.queue.push([name, action]) === 1) {
            this.next();
        }
    }

    status() {
        return {
            running: this.queue[0] && this.queue[0][0],
            queue: this.queue.slice(1).map(([name]) => name),
        };
    }

    private next() {
        const then = () => {
            this.queue.shift();
            if (this.queue.length) {
                this.next();
            }
        }
        this.queue[0][1]().then(then, then);
    }
}
