import { definePlugin } from '@zenstackhq/orm'
import {
  OperationNodeTransformer,
  InsertQueryNode,
  TableNode,
  ColumnNode,
  ValueNode,
  ValuesNode,
  ValueListNode,
  PrimitiveValueListNode,
} from 'kysely';
import { SnowflakeGenerator } from './snowflake-id.js'

const KEY = '@snowflake'
const DEFAULT_OPTIONS = {
  epoch: +new Date('2026-02-28'),
  workerId: 0,
  mode: 63,
  placeholder: 0
}

export const SnowflakeIDGenerator = (options?: any) => new SnowflakeGenerator({
  ...DEFAULT_OPTIONS,
  ...options || {}
})

export class SnowflakeTransformer extends OperationNodeTransformer {
  private readonly schema: any;
  private readonly idFactory: any;
  private readonly options: any;

  constructor({ schema, idFactory, options }: { schema: any; idFactory: any; options?: any; }) {
    super();
    this.schema = schema;
    this.idFactory = idFactory;
    this.options = options;
  }

  transformInsertQuery(node: InsertQueryNode): InsertQueryNode {
    const transformedNode = super.transformInsertQuery(node);

    if (!transformedNode.into || !transformedNode.columns || !transformedNode.values) {
      return transformedNode;
    }

    const modelName = this.extractTableName(transformedNode.into);
    if (!modelName) {
      return transformedNode;
    }

    // 使用浅拷贝并替换 values 节点
    return {
      ...transformedNode,
      values: this.processValues(modelName, transformedNode.columns, transformedNode.values)
    };
  }

  private processValues(modelName: string, columns: readonly ColumnNode[], values: any): any {
    // 使用 Kysely 规范的类型检查
    if (!ValuesNode.is(values)) return values;

    const transformedValueLists = values.values.map((valueList: any) => {
      // 区分 ValueListNode 和 PrimitiveValueListNode
      const isListNode = ValueListNode.is(valueList);
      const isPrimitiveList = PrimitiveValueListNode.is(valueList);

      if (!isListNode && !isPrimitiveList) return valueList;

      const newValues = valueList.values.map((node: any, index: number) => {
        const colNode = columns[index];
        if (!ColumnNode.is(colNode)) return node;

        const fieldName = colNode.column.name;
        const snowflakeConfig = this.getSnowflakeConfig(modelName, fieldName);
        if (!snowflakeConfig) return node;

        // 提取实际值进行占位符匹配
        // ValueListNode 包含的是 ValueNode，PrimitiveValueListNode 包含的是原始值
        const actualValue = ValueNode.is(node) ? node.value : node;

        if (actualValue === this.options.placeholder) {
          const newId = this.idFactory.nextId(snowflakeConfig);
          // 使用工厂方法创建节点，确保内部状态（如 hash）正确
          return isListNode ? ValueNode.create(newId) : newId;
        }

        return node;
      });

      // 使用工厂方法或 clone 机制重建列表节点
      return isListNode
        ? ValueListNode.create(newValues)
        : PrimitiveValueListNode.create(newValues);
    });

    return ValuesNode.create(transformedValueLists);
  }

  private extractTableName(tableNode: TableNode): string | undefined {
    // 尽量通过底层标识符获取名称
    const table = tableNode.table as any;
    return table?.identifier?.name || table?.name;
  }

  private getSnowflakeConfig(modelName: string, fieldName: string): { workerId: any, epoch: any } | null {
    const modelDef = this.schema.models[modelName];
    const fieldDef = modelDef?.fields?.[fieldName];

    if (!fieldDef?.attributes) return null;

    // 假设 KEY 是你定义的常量
    const attr = fieldDef.attributes.find((a: any) => a.name === KEY);
    if (!attr) return null;

    const config = this.getAttrConfig(attr, ['workerId', 'epoch']);
    return { workerId: config.workerId, epoch: config.epoch };
  }

  private getAttrConfig(attr: any, names: string[]): Record<string, any> {
    const config: Record<string, any> = {};
    if (!attr?.args) return config;

    for (const arg of attr.args) {
      if (names.includes(arg.name)) {
        config[arg.name] = arg.value?.value ?? null;
      }
    }
    return config;
  }
}

export default (options?: any) => {
  const newOptions = {
    ...DEFAULT_OPTIONS,
    ...options || {}
  }
  const idFactory = new SnowflakeGenerator(newOptions)
  return definePlugin({
    id: 'snowflake-id',
    name: 'Snowflake ID Plugin',
    description: 'Generates a Snowflake ID for each insert query',
    onKyselyQuery: (args) => {
      const transformer = new SnowflakeTransformer({ schema: args.schema, idFactory, options: newOptions })
      const transformedQuery = transformer.transformNode(args.query)
      return args.proceed(transformedQuery)
    }
  })
}
