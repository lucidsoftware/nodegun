export interface Reader<T> {
    next(data: T): void
    end(): void
}
