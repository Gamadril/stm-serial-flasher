
class Logger {
    constructor() {
        this.allLogger = [];
    }

    registerLogger(logger) {
        this.allLogger.push(logger);
    }

    log(...args) {
        this.allLogger.forEach((logger) => {
            logger.log.apply(null, args);
        });
    }
}

const logger = new Logger();

export default logger;