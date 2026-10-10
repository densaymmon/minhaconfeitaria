import { describe, expect, it } from 'vitest';
import { normalizeOrderDraft } from './order-draft';
describe('order draft normalization', () => {
  it('never accepts foreign product ids or unknown quantities and dates', () => {
    const result = normalizeOrderDraft({ itens: [{ produto_id: 'foreign', produto: 'Bolo', quantidade: null, personalizacao: 'Sem leite' }], data_desejada: '2026-02-30', horario: '25:00', observacoes: null, duvidas: [] }, []);
    expect(result.itens[0]?.produto_id).toBeNull();
    expect(result.itens[0]?.quantidade).toBeNull();
    expect(result.data_desejada).toBeNull();
    expect(result.horario).toBeNull();
    expect(result.duvidas.length).toBe(3);
  });
  it('preserves valid matching products and customizations', () => {
    const result = normalizeOrderDraft({ itens: [{ produto_id: 'a', produto: 'bolo', quantidade: 2, personalizacao: 'Sem cobertura' }], data_desejada: '2026-10-11', horario: '15:00', observacoes: null, duvidas: [] }, [{ id: 'a', nome: 'Bolo de cenoura' }]);
    expect(result.itens[0]).toEqual({ produto_id: 'a', produto: 'Bolo de cenoura', quantidade: 2, personalizacao: 'Sem cobertura' });
    expect(result.data_desejada).toBe('2026-10-11');
    expect(result.duvidas).toEqual([]);
  });
});
