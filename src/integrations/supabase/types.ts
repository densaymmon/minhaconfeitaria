export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          created_at: string
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      compra_itens: {
        Row: {
          compra_id: string
          created_at: string
          id: string
          insumo_id: string
          preco_unitario: number
          quantidade: number
          total: number
          unidade: string
          user_id: string
        }
        Insert: {
          compra_id: string
          created_at?: string
          id?: string
          insumo_id: string
          preco_unitario: number
          quantidade: number
          total?: number
          unidade: string
          user_id?: string
        }
        Update: {
          compra_id?: string
          created_at?: string
          id?: string
          insumo_id?: string
          preco_unitario?: number
          quantidade?: number
          total?: number
          unidade?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_itens_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          cancelada_em: string | null
          created_at: string
          data_compra: string
          estoque_integrado: boolean
          forma_pagamento_compra: string
          id: string
          local_compra: string | null
          numero_parcelas: number
          primeiro_vencimento: string | null
          total: number
          user_id: string
        }
        Insert: {
          cancelada_em?: string | null
          created_at?: string
          data_compra: string
          estoque_integrado?: boolean
          forma_pagamento_compra?: string
          id?: string
          local_compra?: string | null
          numero_parcelas?: number
          primeiro_vencimento?: string | null
          total?: number
          user_id?: string
        }
        Update: {
          cancelada_em?: string | null
          created_at?: string
          data_compra?: string
          estoque_integrado?: boolean
          forma_pagamento_compra?: string
          id?: string
          local_compra?: string | null
          numero_parcelas?: number
          primeiro_vencimento?: string | null
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      confeitarias: {
        Row: {
          aceita_entrega: boolean
          aceita_retirada: boolean
          catalogo_ativo: boolean
          catalogo_aviso: string | null
          cidade: string | null
          created_at: string
          endereco_retirada: string | null
          id: string
          limite_pedidos_dia: number | null
          logo_url: string | null
          nome: string
          pedido_minimo: number
          slogan: string | null
          slug: string | null
          taxa_entrega: number
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          aceita_entrega?: boolean
          aceita_retirada?: boolean
          catalogo_ativo?: boolean
          catalogo_aviso?: string | null
          cidade?: string | null
          created_at?: string
          endereco_retirada?: string | null
          id?: string
          limite_pedidos_dia?: number | null
          logo_url?: string | null
          nome?: string
          pedido_minimo?: number
          slogan?: string | null
          slug?: string | null
          taxa_entrega?: number
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Update: {
          aceita_entrega?: boolean
          aceita_retirada?: boolean
          catalogo_ativo?: boolean
          catalogo_aviso?: string | null
          cidade?: string | null
          created_at?: string
          endereco_retirada?: string | null
          id?: string
          limite_pedidos_dia?: number | null
          logo_url?: string | null
          nome?: string
          pedido_minimo?: number
          slogan?: string | null
          slug?: string | null
          taxa_entrega?: number
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          imposto_pct: number
          pix_chave: string
          pix_tipo: string | null
          taxa_credito: number
          taxa_debito: number
          taxa_dinheiro: number
          taxa_outros: number
          taxa_pix: number
          user_id: string
        }
        Insert: {
          imposto_pct?: number
          pix_chave?: string
          pix_tipo?: string | null
          taxa_credito?: number
          taxa_debito?: number
          taxa_dinheiro?: number
          taxa_outros?: number
          taxa_pix?: number
          user_id?: string
        }
        Update: {
          imposto_pct?: number
          pix_chave?: string
          pix_tipo?: string | null
          taxa_credito?: number
          taxa_debito?: number
          taxa_dinheiro?: number
          taxa_outros?: number
          taxa_pix?: number
          user_id?: string
        }
        Relationships: []
      }
      contas_pagar: {
        Row: {
          cancelada_em: string | null
          compra_id: string | null
          compra_parcela_numero: number | null
          compra_parcelas_total: number | null
          created_at: string
          data_emissao: string
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          forma_pagamento: string | null
          fornecedor: string | null
          gerada_automaticamente: boolean
          id: string
          motivo_cancelamento: string | null
          observacoes: string | null
          parcelamento_id: string | null
          parcelamento_numero: number | null
          parcelamento_total: number | null
          status: string
          updated_at: string
          user_id: string
          valor: number
          valor_pago: number
        }
        Insert: {
          cancelada_em?: string | null
          compra_id?: string | null
          compra_parcela_numero?: number | null
          compra_parcelas_total?: number | null
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          gerada_automaticamente?: boolean
          id?: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          parcelamento_id?: string | null
          parcelamento_numero?: number | null
          parcelamento_total?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          valor: number
          valor_pago?: number
        }
        Update: {
          cancelada_em?: string | null
          compra_id?: string | null
          compra_parcela_numero?: number | null
          compra_parcelas_total?: number | null
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          gerada_automaticamente?: boolean
          id?: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          parcelamento_id?: string | null
          parcelamento_numero?: number | null
          parcelamento_total?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          valor?: number
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar_auditoria: {
        Row: {
          conta_id: string
          created_at: string
          dados: Json
          evento: string
          id: string
          operacao_id: string
          user_id: string
        }
        Insert: {
          conta_id: string
          created_at?: string
          dados?: Json
          evento: string
          id?: string
          operacao_id: string
          user_id: string
        }
        Update: {
          conta_id?: string
          created_at?: string
          dados?: Json
          evento?: string
          id?: string
          operacao_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_auditoria_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar_exclusoes: {
        Row: {
          conta_id: string
          created_at: string
          id: string
          motivo: string
          operacao_id: string
          snapshot: Json
          user_id: string
        }
        Insert: {
          conta_id: string
          created_at?: string
          id?: string
          motivo?: string
          operacao_id: string
          snapshot: Json
          user_id: string
        }
        Update: {
          conta_id?: string
          created_at?: string
          id?: string
          motivo?: string
          operacao_id?: string
          snapshot?: Json
          user_id?: string
        }
        Relationships: []
      }
      contas_pagar_estornos: {
        Row: {
          conta_id: string
          created_at: string
          id: string
          motivo: string
          pagamento_id: string
          user_id: string
          valor: number
        }
        Insert: {
          conta_id: string
          created_at?: string
          id?: string
          motivo: string
          pagamento_id: string
          user_id: string
          valor: number
        }
        Update: {
          conta_id?: string
          created_at?: string
          id?: string
          motivo?: string
          pagamento_id?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_estornos_conta_id_user_id_fkey"
            columns: ["conta_id", "user_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "contas_pagar_estornos_pagamento_id_conta_id_user_id_fkey"
            columns: ["pagamento_id", "conta_id", "user_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_pagamentos"
            referencedColumns: ["id", "conta_id", "user_id"]
          },
        ]
      }
      contas_pagar_operacoes: {
        Row: {
          conta_id: string
          created_at: string
          operacao_id: string
          payload_hash: string
          resultado_id: string
          tipo_operacao: string
          user_id: string
        }
        Insert: {
          conta_id: string
          created_at?: string
          operacao_id: string
          payload_hash: string
          resultado_id: string
          tipo_operacao: string
          user_id: string
        }
        Update: {
          conta_id?: string
          created_at?: string
          operacao_id?: string
          payload_hash?: string
          resultado_id?: string
          tipo_operacao?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_operacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar_pagamentos: {
        Row: {
          conta_id: string
          created_at: string
          data_pagamento: string
          forma_pagamento: string
          id: string
          observacoes: string | null
          user_id: string
          valor: number
        }
        Insert: {
          conta_id: string
          created_at?: string
          data_pagamento?: string
          forma_pagamento: string
          id?: string
          observacoes?: string | null
          user_id: string
          valor: number
        }
        Update: {
          conta_id?: string
          created_at?: string
          data_pagamento?: string
          forma_pagamento?: string
          id?: string
          observacoes?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_pagamentos_conta_id_user_id_fkey"
            columns: ["conta_id", "user_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      despesas: {
        Row: {
          categoria: string
          created_at: string
          data: string
          descricao: string
          id: string
          user_id: string
          valor: number
        }
        Insert: {
          categoria?: string
          created_at?: string
          data?: string
          descricao: string
          id?: string
          user_id?: string
          valor?: number
        }
        Update: {
          categoria?: string
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      estoque_eventos: {
        Row: {
          compra_id: string | null
          created_at: string
          evento_id: string
          id: string
          tipo: string
          user_id: string
        }
        Insert: {
          compra_id?: string | null
          created_at?: string
          evento_id: string
          id?: string
          tipo: string
          user_id: string
        }
        Update: {
          compra_id?: string | null
          created_at?: string
          evento_id?: string
          id?: string
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      estoque_movimentos: {
        Row: {
          created_at: string
          descricao_snapshot: string | null
          evento_id: string
          id: string
          insumo_id: string
          observacao: string | null
          origem_id: string | null
          origem_tipo: string
          pedido_id: string | null
          pedido_numero: number | null
          produto_id: string | null
          quantidade_delta_base: number
          reverte_movimento_id: string | null
          tipo_movimento: string
          unidade_base: string
          user_id: string
        }
        Insert: {
          created_at?: string
          descricao_snapshot?: string | null
          evento_id: string
          id?: string
          insumo_id: string
          observacao?: string | null
          origem_id?: string | null
          origem_tipo: string
          pedido_id?: string | null
          pedido_numero?: number | null
          produto_id?: string | null
          quantidade_delta_base: number
          reverte_movimento_id?: string | null
          tipo_movimento: string
          unidade_base: string
          user_id?: string
        }
        Update: {
          created_at?: string
          descricao_snapshot?: string | null
          evento_id?: string
          id?: string
          insumo_id?: string
          observacao?: string | null
          origem_id?: string | null
          origem_tipo?: string
          pedido_id?: string | null
          pedido_numero?: number | null
          produto_id?: string | null
          quantidade_delta_base?: number
          reverte_movimento_id?: string | null
          tipo_movimento?: string
          unidade_base?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_reverte_movimento_id_fkey"
            columns: ["reverte_movimento_id"]
            isOneToOne: false
            referencedRelation: "estoque_movimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          preco_embalagem: number | null
          preco_unidade: number
          quantidade_embalagem: number | null
          tipo: string
          unidade: string
          unidade_embalagem: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          preco_embalagem?: number | null
          preco_unidade?: number
          quantidade_embalagem?: number | null
          tipo?: string
          unidade?: string
          unidade_embalagem?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          preco_embalagem?: number | null
          preco_unidade?: number
          quantidade_embalagem?: number | null
          tipo?: string
          unidade?: string
          unidade_embalagem?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inventario_eventos: {
        Row: {
          created_at: string
          evento_id: string
          id: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          evento_id: string
          id?: string
          payload: Json
          user_id: string
        }
        Update: {
          created_at?: string
          evento_id?: string
          id?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      owner_claim: {
        Row: {
          slot: boolean
          user_id: string
        }
        Insert: {
          slot?: boolean
          user_id: string
        }
        Update: {
          slot?: boolean
          user_id?: string
        }
        Relationships: []
      }
      pedido_itens: {
        Row: {
          custo_unitario: number
          descricao: string
          id: string
          pedido_id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
          quantidade_produzida: number
          user_id: string
        }
        Insert: {
          custo_unitario?: number
          descricao: string
          id?: string
          pedido_id: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          quantidade_produzida?: number
          user_id?: string
        }
        Update: {
          custo_unitario?: number
          descricao?: string
          id?: string
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          quantidade_produzida?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_pagamentos: {
        Row: {
          created_at: string
          data_pagamento: string
          forma_pagamento: string
          id: string
          observacoes: string | null
          pedido_id: string
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          data_pagamento?: string
          forma_pagamento: string
          id?: string
          observacoes?: string | null
          pedido_id: string
          user_id?: string
          valor: number
        }
        Update: {
          created_at?: string
          data_pagamento?: string
          forma_pagamento?: string
          id?: string
          observacoes?: string | null
          pedido_id?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_pagamentos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          aviso_pronto_enviado_em: string | null
          catalogo_token: string | null
          cliente_id: string | null
          codigo_curto: string | null
          codigo_publico: string | null
          confirmacao_enviada_em: string | null
          created_at: string
          data_entrega: string
          desconto: number
          endereco_entrega: string | null
          forma_pagamento: string
          hora_entrega: string | null
          id: string
          numero: number
          observacoes: string | null
          origem: string
          pagamento_informado_em: string | null
          saldo_quitado: boolean
          status: string
          taxa_entrega: number
          tipo_entrega: string | null
          user_id: string
          valor_entrada: number
          visualizado_em: string | null
        }
        Insert: {
          aviso_pronto_enviado_em?: string | null
          catalogo_token?: string | null
          cliente_id?: string | null
          codigo_curto?: string | null
          codigo_publico?: string | null
          confirmacao_enviada_em?: string | null
          created_at?: string
          data_entrega: string
          desconto?: number
          endereco_entrega?: string | null
          forma_pagamento?: string
          hora_entrega?: string | null
          id?: string
          numero?: never
          observacoes?: string | null
          origem?: string
          pagamento_informado_em?: string | null
          saldo_quitado?: boolean
          status?: string
          taxa_entrega?: number
          tipo_entrega?: string | null
          user_id?: string
          valor_entrada?: number
          visualizado_em?: string | null
        }
        Update: {
          aviso_pronto_enviado_em?: string | null
          catalogo_token?: string | null
          cliente_id?: string | null
          codigo_curto?: string | null
          codigo_publico?: string | null
          confirmacao_enviada_em?: string | null
          created_at?: string
          data_entrega?: string
          desconto?: number
          endereco_entrega?: string | null
          forma_pagamento?: string
          hora_entrega?: string | null
          id?: string
          numero?: never
          observacoes?: string | null
          origem?: string
          pagamento_informado_em?: string | null
          saldo_quitado?: boolean
          status?: string
          taxa_entrega?: number
          tipo_entrega?: string | null
          user_id?: string
          valor_entrada?: number
          visualizado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_recorrentes: {
        Row: {
          ativa: boolean
          cliente_id: string
          created_at: string
          data_fim: string | null
          data_inicio: string
          frequencia: string
          hora_entrega: string | null
          id: string
          observacoes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativa?: boolean
          cliente_id: string
          created_at?: string
          data_fim?: string | null
          data_inicio: string
          frequencia: string
          hora_entrega?: string | null
          id?: string
          observacoes?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          ativa?: boolean
          cliente_id?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          frequencia?: string
          hora_entrega?: string | null
          id?: string
          observacoes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_recorrentes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_recorrentes_ocorrencias: {
        Row: {
          created_at: string
          data_entrega: string
          id: string
          itens: Json
          observacoes: string | null
          pedido_id: string | null
          recorrencia_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_entrega: string
          id?: string
          itens?: Json
          observacoes?: string | null
          pedido_id?: string | null
          recorrencia_id: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          data_entrega?: string
          id?: string
          itens?: Json
          observacoes?: string | null
          pedido_id?: string | null
          recorrencia_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_recorrentes_ocorrencias_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: true
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_recorrentes_ocorrencias_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "pedidos_recorrentes"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_eventos: {
        Row: {
          created_at: string
          descricao_snapshot: string | null
          evento_id: string
          id: string
          pedido_id: string | null
          pedido_item_id: string
          pedido_numero: number | null
          produto_id: string | null
          quantidade_pedida_snapshot: number | null
          quantidade_resultado: number
          quantidade_resultante: number
          receita_snapshot: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          descricao_snapshot?: string | null
          evento_id: string
          id?: string
          pedido_id?: string | null
          pedido_item_id: string
          pedido_numero?: number | null
          produto_id?: string | null
          quantidade_pedida_snapshot?: number | null
          quantidade_resultado: number
          quantidade_resultante: number
          receita_snapshot?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          descricao_snapshot?: string | null
          evento_id?: string
          id?: string
          pedido_id?: string | null
          pedido_item_id?: string
          pedido_numero?: number | null
          produto_id?: string | null
          quantidade_pedida_snapshot?: number | null
          quantidade_resultado?: number
          quantidade_resultante?: number
          receita_snapshot?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      produto_midias: {
        Row: {
          created_at: string
          id: string
          ordem: number
          produto_id: string
          tipo: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ordem?: number
          produto_id: string
          tipo: string
          url: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          ordem?: number
          produto_id?: string
          tipo?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          antecedencia_dias: number
          ativo: boolean
          categoria: string
          created_at: string
          custo_alterado_em: string | null
          custo_energia: number
          custo_gas: number
          custo_mao_obra: number
          descricao: string | null
          id: string
          imagem_url: string | null
          margem_desejada: number
          modo_preparo: string | null
          no_catalogo: boolean
          nome: string
          preco_venda: number
          rendimento: number
          user_id: string
        }
        Insert: {
          antecedencia_dias?: number
          ativo?: boolean
          categoria?: string
          created_at?: string
          custo_alterado_em?: string | null
          custo_energia?: number
          custo_gas?: number
          custo_mao_obra?: number
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          margem_desejada?: number
          modo_preparo?: string | null
          no_catalogo?: boolean
          nome: string
          preco_venda?: number
          rendimento?: number
          user_id?: string
        }
        Update: {
          antecedencia_dias?: number
          ativo?: boolean
          categoria?: string
          created_at?: string
          custo_alterado_em?: string | null
          custo_energia?: number
          custo_gas?: number
          custo_mao_obra?: number
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          margem_desejada?: number
          modo_preparo?: string | null
          no_catalogo?: boolean
          nome?: string
          preco_venda?: number
          rendimento?: number
          user_id?: string
        }
        Relationships: []
      }
      receita_itens: {
        Row: {
          id: string
          insumo_id: string
          produto_id: string
          quantidade: number
          quantidade_utilizada: number | null
          unidade_receita: string | null
          user_id: string
        }
        Insert: {
          id?: string
          insumo_id: string
          produto_id: string
          quantidade?: number
          quantidade_utilizada?: number | null
          unidade_receita?: string | null
          user_id?: string
        }
        Update: {
          id?: string
          insumo_id?: string
          produto_id?: string
          quantidade?: number
          quantidade_utilizada?: number | null
          unidade_receita?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receita_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receita_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      codigo_curto_pedido: {
        Args: { p_codigo: string }
        Returns: string
      }
      informar_pagamento_pedido: {
        Args: { p_codigo: string }
        Returns: boolean
      }
      pedido_publico: {
        Args: { p_codigo: string }
        Returns: Json
      }
      salvar_midias_produto: {
        Args: { p_midias: Json; p_produto_id: string }
        Returns: number
      }
      acompanhar_pedido_catalogo: {
        Args: { p_codigo: string }
        Returns: Json
      }
      catalogo_publico: {
        Args: { p_slug: string }
        Returns: Json
      }
      criar_pedido_catalogo: {
        Args: {
          p_cliente: Json
          p_entrega: Json
          p_itens: Json
          p_slug: string
          p_token: string
        }
        Returns: Json
      }
      informar_pagamento_catalogo: {
        Args: { p_codigo: string }
        Returns: boolean
      }
      _conta_pagar_operacao_existente: {
        Args: {
          p_hash: string
          p_operacao_id: string
          p_tipo: string
          p_user_id: string
        }
        Returns: string
      }
      _recalcular_resumo_conta_pagar: {
        Args: { p_conta_id: string; p_user_id: string }
        Returns: undefined
      }
      ajustar_producao: {
        Args: {
          evento_id: string
          pedido_item_id: string
          quantidade_resultado: number
        }
        Returns: number
      }
      cancelar_compra: {
        Args: { evento_id: string; registro_id: string }
        Returns: boolean
      }
      cancelar_conta_pagar: {
        Args: { p_conta_id: string; p_motivo: string; p_operacao_id: string }
        Returns: string
      }
      confirmar_ocorrencia_recorrente: {
        Args: { p_itens: Json; p_ocorrencia_id: string; p_payload: Json }
        Returns: string
      }
      editar_recebimento_pedido: {
        Args: {
          p_data_pagamento: string
          p_forma_pagamento: string
          p_observacoes?: string
          p_pagamento_id: string
          p_valor: number
        }
        Returns: string
      }
      editar_valores_pedido_com_producao: {
        Args: {
          p_desconto: number
          p_itens: Json
          p_pedido_id: string
          p_taxa_entrega: number
        }
        Returns: Json
      }
      estornar_pagamento_conta_pagar: {
        Args: {
          p_motivo: string
          p_operacao_id: string
          p_pagamento_id: string
          p_valor: number
        }
        Returns: string
      }
      excluir_compra: {
        Args: { evento_id: string; registro_id: string }
        Returns: boolean
      }
      excluir_conta_pagar_cancelada: {
        Args: { p_conta_id: string; p_operacao_id: string }
        Returns: string
      }
      excluir_insumo_se_sem_receita: {
        Args: { p_insumo_id: string }
        Returns: undefined
      }
      medida_base: { Args: { u: string }; Returns: string }
      medida_fator: { Args: { u: string }; Returns: number }
      recalcular_custos_historicos: { Args: never; Returns: number }
      reconciliar_compra_com_pagamentos: {
        Args: {
          p_compra_id: string
          p_forma_pagamento: string
          p_numero_parcelas?: number
          p_primeiro_vencimento?: string
        }
        Returns: boolean
      }
      registrar_inventario_fisico: {
        Args: { evento_id: string; itens: Json }
        Returns: boolean
      }
      registrar_local_compra: {
        Args: { local_compra: string; registro_id: string }
        Returns: undefined
      }
      registrar_pagamento_compra: {
        Args: {
          p_compra_id: string
          p_forma_pagamento: string
          p_numero_parcelas?: number
          p_primeiro_vencimento?: string
        }
        Returns: boolean
      }
      registrar_pagamento_conta_pagar: {
        Args: {
          p_conta_id: string
          p_data_pagamento: string
          p_forma_pagamento: string
          p_observacoes: string
          p_operacao_id: string
          p_valor: number
        }
        Returns: string
      }
      registrar_conta_pagar_parcelada: {
        Args: {
          p_dados: Json
          p_numero_parcelas: number
          p_primeiro_vencimento: string
          p_operacao_id: string
        }
        Returns: boolean
      }
      registrar_recebimento_pedido: {
        Args: {
          p_data_pagamento: string
          p_forma_pagamento: string
          p_observacoes?: string
          p_pedido_id: string
          p_valor: number
        }
        Returns: string
      }
      saldo_estoque: {
        Args: never
        Returns: {
          insumo_id: string
          nome: string
          saldo: number
          unidade_base: string
        }[]
      }
      salvar_compra: {
        Args: {
          evento_id?: string
          itens: Json
          payload: Json
          registro_id?: string
        }
        Returns: string
      }
      salvar_conta_pagar: {
        Args: { p_conta_id?: string; p_dados: Json; p_operacao_id?: string }
        Returns: string
      }
      salvar_pedido: {
        Args: { itens: Json; payload: Json; registro_id?: string }
        Returns: string
      }
      salvar_produto: {
        Args: { itens: Json; payload: Json; registro_id?: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
