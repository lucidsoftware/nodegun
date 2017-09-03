export class NamedLock {
    private queue: ([string, () => Promise<void>])[] = [];

    acquire(name: string, action: () => Promise<void>) {
        if (this.queue.push([name, action]) === 1) {
            this.next();
        }
    }

    status() {
        const [running, ...queue] = this.queue.map(([name]) => name);
        return {running: running || null, queue};
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
