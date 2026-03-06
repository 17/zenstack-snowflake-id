/**
 * Synchronous Flake ID Generator
 * * @param {Object} options
 * @param {number} options.epoch - 起始时间戳
 * @param {number} [options.workerId=0] - 节点 ID
 * @param {53 | 63} [options.mode=63] - 模式
 */
export default function CreateSnowflakeID({ epoch, workerId = 0, mode = 63 }) {
  let lastTimestamp = -1
  let sequence = 0

  const OPTIONS = {
    epoch,
    workerId,
    mode,
  }

  // 位分配配置
  const CONFIG = {
    53: {
      // 40位时间戳 (约34.8年) | 3位Worker (0-7) | 10位序列 (0-1023) = 53位
      timeShift: 13n,
      workerShift: 10n,
      workerMask: 7n,    // 2^3 - 1
      seqMask: 1023n,   // 2^10 - 1
      maxWorkerId: 7,
    },
    63: {
      // 41位时间戳 (约69年) | 10位Worker (0-1023) | 12位序列 (0-4095) = 63位
      timeShift: 22n,
      workerShift: 12n,
      workerMask: 1023n, // 2^10 - 1
      seqMask: 4095n,   // 2^12 - 1
      maxWorkerId: 1023,
    }
  }

  const conf = CONFIG[mode]
  if (!conf) throw new Error('Invalid mode.')
  if (workerId < 0 || workerId > conf.maxWorkerId) {
    throw new Error(`${mode} workerId must be 0-${conf.maxWorkerId}`)
  }

  const waitUntilNextMillis = (last) => {
    let now = Date.now()
    while (now <= last) now = Date.now()
    return now
  }

  function nextId({ epoch, workerId }) {
    let now = Date.now()

    const bigEpoch = BigInt(epoch || OPTIONS.epoch)
    const bigWorkerId = BigInt(workerId || OPTIONS.workerId)

    if (now < lastTimestamp) throw new Error('Clock moved backwards')

    if (now === lastTimestamp) {
      // 位运算掩码处理序列号溢出
      sequence = (sequence + 1) & Number(conf.seqMask)
      if (sequence === 0) {
        now = waitUntilNextMillis(lastTimestamp)
      }
    } else {
      sequence = 0
    }

    lastTimestamp = now

    // 使用 BigInt 进行位运算组装
    const id = (BigInt(now) - bigEpoch) << conf.timeShift
      | (bigWorkerId << conf.workerShift)
      | BigInt(sequence)

    // 53bit 模式转回 Number，standard 模式保留 BigInt
    return mode === 53 ? Number(id) : id
  }

  function parse(id, epoch) {
    const bigId = BigInt(id)
    const bigEpoch = BigInt(epoch || OPTIONS.epoch)
    return {
      time: new Date(Number((bigId >> conf.timeShift) + bigEpoch)),
      workerId: Number((bigId >> conf.workerShift) & conf.workerMask),
      sequence: Number(bigId & conf.seqMask)
    }
  }

  return { nextId, parse }
}

// const s = new snowflakeID({ epoch: 1640995200000, workerId: 0, mode: 53' })
// console.log(s.nextId(), s.parse(s.nextId()))
