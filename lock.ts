export class Lock {
    private queue: (() => void)[] | null = null;

    acquire(): Promise<() => void> {
        if (this.queue) {
            return new Promise(resolve => this.queue!.push(() => resolve(() => this.next())));
        }
        this.queue = [];
        return Promise.resolve(() => this.next());
    }

    private next() {
        if (this.queue) {
            const current = this.queue.shift();
            if (current) {
                current();
            } else {
                this.queue = null;
            }   
        }
    }
}
