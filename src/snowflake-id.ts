/**
 * 雪花算法配置接口
 */
interface SnowflakeConfig {
  timeShift: bigint;
  workerShift: bigint;
  workerMask: bigint;
  seqMask: bigint;
  maxWorkerId: number;
}

/**
 * 对应 nextId 方法的参数约束
 */
export interface NextIdOptions {
  epoch?: number;
  workerId?: number;
}

/**
 * Synchronous Snowflake ID Generator
 */
export class SnowflakeGenerator {
  private lastTimestamp = -1;
  private sequence = 0;
  private readonly conf: SnowflakeConfig;

  private readonly epoch: number;
  private readonly workerId: number;
  private readonly mode: 53 | 63;

  private static readonly CONFIG: Record<number, SnowflakeConfig> = {
    53: {
      // 40位时间戳 | 3位Worker | 10位序列 = 53位 (Number.MAX_SAFE_INTEGER)
      timeShift: 13n,
      workerShift: 10n,
      workerMask: 7n,
      seqMask: 1023n,
      maxWorkerId: 7,
    },
    63: {
      // 41位时间戳 | 10位Worker | 12位序列 = 63位
      timeShift: 22n,
      workerShift: 12n,
      workerMask: 1023n,
      seqMask: 4095n,
      maxWorkerId: 1023,
    },
  };

  constructor({ epoch, workerId = 0, mode = 63 }: { epoch: number; workerId?: number; mode?: 53 | 63 }) {
    this.conf = SnowflakeGenerator.CONFIG[mode];
    if (!this.conf) throw new Error('Invalid mode.');

    if (workerId < 0 || workerId > this.conf.maxWorkerId) {
      throw new Error(`${mode} mode workerId must be 0-${this.conf.maxWorkerId}`);
    }

    this.epoch = epoch;
    this.workerId = workerId;
    this.mode = mode;
  }

  /**
   * 生成下一个 ID
   */
  public nextId(options?: NextIdOptions): string | number | bigint {
    let now = Date.now();

    // 优先使用传入的配置，否则使用实例化时的默认值
    const bigEpoch = BigInt(options?.epoch ?? this.epoch);
    const bigWorkerId = BigInt(options?.workerId ?? this.workerId);

    if (now < this.lastTimestamp) {
      throw new Error('Clock moved backwards');
    }

    if (now === this.lastTimestamp) {
      this.sequence = (this.sequence + 1) & Number(this.conf.seqMask);
      if (this.sequence === 0) {
        now = this.waitUntilNextMillis(this.lastTimestamp);
      }
    } else {
      this.sequence = 0;
    }

    this.lastTimestamp = now;

    const id =
      ((BigInt(now) - bigEpoch) << this.conf.timeShift) |
      (bigWorkerId << this.conf.workerShift) |
      BigInt(this.sequence);

    return this.mode === 53 ? Number(id) : id;
  }

  /**
   * 解析 ID
   */
  public parse(id: number | bigint | string, customEpoch?: number | bigint) {
    const bigId = BigInt(id);
    const bigEpoch = BigInt(customEpoch ?? this.epoch);

    return {
      time: new Date(Number((bigId >> this.conf.timeShift) + bigEpoch)),
      workerId: Number((bigId >> this.conf.workerShift) & this.conf.workerMask),
      sequence: Number(bigId & this.conf.seqMask),
    };
  }

  private waitUntilNextMillis(last: number): number {
    let now = Date.now();
    while (now <= last) {
      now = Date.now();
    }
    return now;
  }
}