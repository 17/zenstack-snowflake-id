// import { definePlugin } from '@zenstackhq/orm'
import { ExpressionUtils, } from '@zenstackhq/orm/schema'
import { ColumnNode, OperationNodeTransformer, PrimitiveValueListNode, TableNode, ValueListNode, ValueNode, ValuesNode, } from 'kysely'
import CreateSnowflakeID from './snowflake-id.js'

const KEY = '@snowflake'
const DEFAULT_OPTIONS = {
  epoch: +new Date('2026-02-28'),
  workerId: 0,
  mode: 63,
  placeholder: 0
}

/**
 * Kysely 查询转换器：为带有 @snowflake 属性的字段自动生成 ID
 */
class SnowflakeTransformer extends OperationNodeTransformer {
  constructor({ schema, idFactory, options }) {
    super()
    this.schema = schema
    this.options = options
    this.idFactory = idFactory
  }

  transformInsertQuery(node, queryId) {
    if (!node.into || !node.columns || !node.values) {
      return super.transformInsertQuery(node, queryId)
    }
    const modelName = this.extractTableName(node.into)
    if (!modelName) {
      return super.transformInsertQuery(node, queryId)
    }
    const transformedValues = this.transformInsertValues(modelName, node.columns, node.values)
    const baseResult = super.transformInsertQuery(node, queryId)
    return Object.assign(Object.assign({}, baseResult), { values: transformedValues })
  }

  transformInsertValues(modelName, columns, values) {
    if (!ValuesNode.is(values)) {
      return values
    }
    const transformedValueLists = values.values.map((valueList) => {
      // 处理原始值列表
      if (PrimitiveValueListNode.is(valueList)) {
        const transformedValues = valueList.values.map((value, index) => {
          const fieldName = columns[index].column.name
          if (!this.isSnowflakeField(modelName, fieldName)) {
            return value
          }

          console.log(value !== this.options.placeholder, value, this.options.placeholder, this.options)
          // 等于 0 的值，则生成雪花 ID
          return value !== this.options.placeholder ? value : this.getSnowflakeID(modelName, fieldName)
        })
        return PrimitiveValueListNode.create(transformedValues)
      }
      // 处理 ValueNode 列表
      if (ValueListNode.is(valueList)) {
        const transformedValues = valueList.values.map((valueNode, index) => {
          const colNode = columns[index]
          if (!ColumnNode.is(colNode)) {
            return valueNode
          }
          const fieldName = colNode.column.name
          if (!this.isSnowflakeField(modelName, fieldName)) {
            return valueNode
          }
          // 等于 0 的值，则生成雪花  ID
          return ValueNode.is(valueNode) && valueNode.value !== this.options.placeholder ? valueNode : this.getSnowflakeID(modelName, fieldName)
        })
        return ValueListNode.create(transformedValues)
      }
      return valueList
    })
    return ValuesNode.create(transformedValueLists)
  }

  extractTableName(tableNode) {
    if (!tableNode || !TableNode.is(tableNode)) {
      return undefined
    }
    return tableNode.table.identifier.name
  }

  isSnowflakeField(modelName, fieldName) {
    const modelDef = this.schema.models[modelName]
    if (!modelDef) {
      return false
    }

    const fieldDef = modelDef.fields[fieldName]
    if (!fieldDef) {
      return false
    }

    return (
      fieldDef.attributes?.some((attr) => attr.name === KEY) ?? false
    )
  }

  getAttrValue(attr, name) {
    const midArg = attr.args?.find(a => a.name === name)
    if (ExpressionUtils.isLiteral(midArg?.value)) {
      return midArg.value.value
    }
    return null
  }

  getSnowflakeID(modelName, fieldName) {
    const fieldDef = this.schema.models[modelName].fields[fieldName]
    const attr = fieldDef.attributes?.find((a) => a.name === KEY)
    const workerId = this.getAttrValue(attr, 'workerId')
    const epoch = this.getAttrValue(attr, 'epoch')
    return this.idFactory.nextId({ workerId, epoch })
  }
}

// function isAttrField(field, key) {
//     return field.attributes?.some((attr) => attr.name === `@${key}`) ?? false
// }
// function hasFieldAttr(model, key) {
//     return Object.values(model.fields).some((field) => isAttrField(field, key))
// }
// definePlugin
export class SnowflakePlugin {
  constructor(options) {
    // console.log('SnowflakePlugin', options)
    this.id = 'snowflake-id'
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options
    }
    this.idFactory = new CreateSnowflakeID(this.options)
    this.onKyselyQuery = async (args) => {
      // console.log('onKyselyQuery', args)
      const transformer = new SnowflakeTransformer({ schema: args.schema, idFactory: this.idFactory, options: this.options })
      const transformedQuery = transformer.transformNode(args.query)
      return args.proceed(transformedQuery)
    }
    // this.onQuery = async (args1) => {
    //     // console.log('onQuery1', args1)
    //     const { model, operation, args, proceed, client } = args1
    //     const schema = client.schema
    //     const modelDef = schema.models[model]

    //     // console.log('modelDef', hasFieldAttr(modelDef, 'snowflake'), args)
    //     if (!modelDef || !hasFieldAttr(modelDef, 'snowflake')) {
    //         return proceed(args)
    //     }

    //     // console.log('onQuery', model, operation, args)
    //     return proceed(args)
    // }
    // this.onEntityMutation = async (args) => {
    //     const afterEntities = await args.loadAfterMutationEntities()
    //     console.log('onEntityMutation', args, afterEntities)
    //     // return args.proceed(args.entity)
    // }
  }
}

export const SnowflakeIDGenerator = (options) => new SnowflakePlugin(options || DEFAULT_OPTIONS)
