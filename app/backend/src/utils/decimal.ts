import { Decimal } from 'decimal.js';

/**
 * 货币计算工具类
 * 提供高精度的货币计算功能，避免浮点数精度问题
 */
export class CurrencyCalculator {
  /**
   * 创建一个新的Decimal实例
   * @param value 数值，可以是字符串、数字或Decimal
   * @returns Decimal实例
   */
  static create(value: string | number | Decimal): Decimal {
    return new Decimal(value);
  }

  /**
   * 格式化货币显示，保留两位小数
   * @param value Decimal值
   * @returns 格式化后的字符串
   */
  static format(value: Decimal): string {
    return value.toFixed(2);
  }

  /**
   * 将Decimal转换为数据库存储格式
   * @param value Decimal值
   * @returns 数据库存储用的字符串
   */
  static toDatabase(value: Decimal): string {
    return value.toString();
  }

  /**
   * 从数据库值创建Decimal
   * @param value 数据库中的值
   * @returns Decimal实例
   */
  static fromDatabase(value: any): Decimal {
    return new Decimal(value);
  }

  /**
   * 计算折扣价格
   * @param originalPrice 原价
   * @param discountPercent 折扣百分比 (0-100)
   * @returns 折扣后价格
   */
  static calculateDiscount(originalPrice: Decimal, discountPercent: number): Decimal {
    const discount = originalPrice.mul(discountPercent).div(100);
    return originalPrice.sub(discount);
  }

  /**
   * 计算税费
   * @param price 价格
   * @param taxRate 税率 (0-1)
   * @returns 含税价格
   */
  static calculateTax(price: Decimal, taxRate: number): Decimal {
    const tax = price.mul(taxRate);
    return price.add(tax);
  }

  /**
   * 比较两个货币值
   * @param a 第一个值
   * @param b 第二个值
   * @returns 比较结果: -1(a<b), 0(a=b), 1(a>b)
   */
  static compare(a: Decimal, b: Decimal): number {
    return a.comparedTo(b);
  }

  /**
   * 检查金额是否有效（大于0）
   * @param amount 金额
   * @returns 是否有效
   */
  static isValidAmount(amount: Decimal): boolean {
    return amount.greaterThan(0);
  }

  /**
   * 转换为分（用于支付接口）
   * @param yuan 元
   * @returns 分
   */
  static yuanToFen(yuan: Decimal): number {
    return yuan.mul(100).toNumber();
  }

  /**
   * 从分转换为元
   * @param fen 分
   * @returns 元
   */
  static fenToYuan(fen: number): Decimal {
    return new Decimal(fen).div(100);
  }
}

/**
 * Zod schema for Decimal validation
 */
export const DecimalSchema = {
  /**
   * 验证货币金额的schema
   */
  currency: () => ({
    refine: (val: any) => {
      try {
        const decimal = new Decimal(val);
        return decimal.greaterThanOrEqualTo(0);
      } catch {
        return false;
      }
    },
    message: "Invalid currency amount"
  }),

  /**
   * 验证正数货币金额的schema
   */
  positiveCurrency: () => ({
    refine: (val: any) => {
      try {
        const decimal = new Decimal(val);
        return decimal.greaterThan(0);
      } catch {
        return false;
      }
    },
    message: "Currency amount must be positive"
  })
}; 