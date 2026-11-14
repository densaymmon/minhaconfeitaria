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
      assinatura_pagamentos: {
        Row: {
          created_at: string
          forma: string | null
          id: string
          meses: number
          observacao: string | null
          pago_ate_anterior: string | null
          pago_ate_novo: string
          pago_em: string
          plano_id: string | null
          registrado_por: string | null
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          forma?: string | null
          id?: string
          meses: number
          observacao?: string | null
          pago_ate_anterior?: string | null
          pago_ate_novo: string
          pago_em: string
          plano_id?: string | null
          registrado_por?: string | null
          user_id: string
          valor: number
        }
        Update: {
          created_at?: string
          forma?: string | null
          id?: string
          meses?: number
          observacao?: string | null
          pago_ate_anterior?: string | null
          pago_ate_novo?: string
          pago_em?: string
          plano_id?: string | null
          registrado_por?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "assinatura_pagamentos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas: {
        Row: {
          ciclo: string
          created_at: string
          pago_ate: string | null
          plano_id: string
          situacao: string
          teste_ate: string | null
          updated_at: string
          user_id: string
          valor: number | null
        }
        Insert: {
          ciclo?: string
          created_at?: string
          pago_ate?: string | null
          plano_id: string
          situacao?: string
          teste_ate?: string | null
          updated_at?: string
          user_id: string
          valor?: number | null
        }
        Update: {
          ciclo?: string
          created_at?: string
          pago_ate?: string | null
          plano_id?: string
          situacao?: string
          teste_ate?: string | null
          updated_at?: string
          user_id?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacoes: {
        Row: {
          cliente_nome: string | null
          comentario: string | null
          created_at: string
          id: string
          nota: number
          pedido_id: string
          publicada: boolean
          user_id: string
        }
        Insert: {
          cliente_nome?: string | null
          comentario?: string | null
          created_at?: string
          id?: string
          nota: number
          pedido_id: string
          publicada?: boolean
          user_id: string
        }
        Update: {
          cliente_nome?: string | null
          comentario?: string | null
          created_at?: string
          id?: string
          nota?: number
          pedido_id?: string
          publicada?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: true
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
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
          aceita_encomenda: boolean
          aceita_entrega: boolean
          aceita_retirada: boolean
          acesso: string
          acesso_atualizado_em: string | null
          catalogo_ativo: boolean
          catalogo_aviso: string | null
          cidade: string | null
          cor_primaria: string | null
          created_at: string
          datas_bloqueadas: string[]
          dias_fechados: number[]
          endereco_cardapio: string | null
          endereco_retirada: string | null
          fidelidade_a_cada: number
          fidelidade_tipo: string
          fidelidade_valor: number
          horarios_retirada: string[]
          id: string
          limite_pedidos_dia: number | null
          logo_url: string | null
          meta_vendas_mes: number
          nome: string
          onboarding_concluido_em: string | null
          pedido_minimo: number
          sinal_a_partir_de: number
          sinal_percentual: number
          slogan: string | null
          slug: string | null
          taxa_entrega: number
          taxas_bairro: Json
          termos_aceitos_em: string | null
          termos_versao: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          aceita_encomenda?: boolean
          aceita_entrega?: boolean
          aceita_retirada?: boolean
          acesso?: string
          acesso_atualizado_em?: string | null
          catalogo_ativo?: boolean
          catalogo_aviso?: string | null
          cidade?: string | null
          cor_primaria?: string | null
          created_at?: string
          datas_bloqueadas?: string[]
          dias_fechados?: number[]
          endereco_cardapio?: string | null
          endereco_retirada?: string | null
          fidelidade_a_cada?: number
          fidelidade_tipo?: string
          fidelidade_valor?: number
          horarios_retirada?: string[]
          id?: string
          limite_pedidos_dia?: number | null
          logo_url?: string | null
          meta_vendas_mes?: number
          nome?: string
          onboarding_concluido_em?: string | null
          pedido_minimo?: number
          sinal_a_partir_de?: number
          sinal_percentual?: number
          slogan?: string | null
          slug?: string | null
          taxa_entrega?: number
          taxas_bairro?: Json
          termos_aceitos_em?: string | null
          termos_versao?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Update: {
          aceita_encomenda?: boolean
          aceita_entrega?: boolean
          aceita_retirada?: boolean
          acesso?: string
          acesso_atualizado_em?: string | null
          catalogo_ativo?: boolean
          catalogo_aviso?: string | null
          cidade?: string | null
          cor_primaria?: string | null
          created_at?: string
          datas_bloqueadas?: string[]
          dias_fechados?: number[]
          endereco_cardapio?: string | null
          endereco_retirada?: string | null
          fidelidade_a_cada?: number
          fidelidade_tipo?: string
          fidelidade_valor?: number
          horarios_retirada?: string[]
          id?: string
          limite_pedidos_dia?: number | null
          logo_url?: string | null
          meta_vendas_mes?: number
          nome?: string
          onboarding_concluido_em?: string | null
          pedido_minimo?: number
          sinal_a_partir_de?: number
          sinal_percentual?: number
          slogan?: string | null
          slug?: string | null
          taxa_entrega?: number
          taxas_bairro?: Json
          termos_aceitos_em?: string | null
          termos_versao?: string | null
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
      cupons: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          limite_usos: number | null
          pedido_minimo: number
          primeira_compra: boolean
          tipo: string
          user_id: string
          usos: number
          valido_ate: string | null
          valor: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          limite_usos?: number | null
          pedido_minimo?: number
          primeira_compra?: boolean
          tipo: string
          user_id?: string
          usos?: number
          valido_ate?: string | null
          valor: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          limite_usos?: number | null
          pedido_minimo?: number
          primeira_compra?: boolean
          tipo?: string
          user_id?: string
          usos?: number
          valido_ate?: string | null
          valor?: number
        }
        Relationships: []
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
      equipe_convites: {
        Row: {
          aceito_em: string | null
          cancelado_em: string | null
          created_at: string
          dono_id: string
          email: string
          expira_em: string
          id: string
          papel: string
          token: string
        }
        Insert: {
          aceito_em?: string | null
          cancelado_em?: string | null
          created_at?: string
          dono_id: string
          email: string
          expira_em?: string
          id?: string
          papel: string
          token?: string
        }
        Update: {
          aceito_em?: string | null
          cancelado_em?: string | null
          created_at?: string
          dono_id?: string
          email?: string
          expira_em?: string
          id?: string
          papel?: string
          token?: string
        }
        Relationships: []
      }
      equipe_membros: {
        Row: {
          created_at: string
          dono_id: string
          email: string
          id: string
          membro_id: string
          nome: string | null
          papel: string
        }
        Insert: {
          created_at?: string
          dono_id: string
          email: string
          id?: string
          membro_id: string
          nome?: string | null
          papel: string
        }
        Update: {
          created_at?: string
          dono_id?: string
          email?: string
          id?: string
          membro_id?: string
          nome?: string | null
          papel?: string
        }
        Relationships: []
      }
      erros_app: {
        Row: {
          agente: string | null
          confeitaria_id: string | null
          detalhe: string | null
          id: string
          mensagem: string
          origem: string
          primeiro_em: string
          ultimo_em: string
          url: string | null
          user_id: string | null
          vezes: number
        }
        Insert: {
          agente?: string | null
          confeitaria_id?: string | null
          detalhe?: string | null
          id?: string
          mensagem: string
          origem: string
          primeiro_em?: string
          ultimo_em?: string
          url?: string | null
          user_id?: string | null
          vezes?: number
        }
        Update: {
          agente?: string | null
          confeitaria_id?: string | null
          detalhe?: string | null
          id?: string
          mensagem?: string
          origem?: string
          primeiro_em?: string
          ultimo_em?: string
          url?: string | null
          user_id?: string | null
          vezes?: number
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
      historico: {
        Row: {
          acao: string
          autor: string
          autor_id: string | null
          created_at: string
          detalhe: string | null
          entidade: string
          id: string
          pedido_numero: number | null
          registro_id: string | null
          user_id: string
        }
        Insert: {
          acao: string
          autor: string
          autor_id?: string | null
          created_at?: string
          detalhe?: string | null
          entidade: string
          id?: string
          pedido_numero?: number | null
          registro_id?: string | null
          user_id: string
        }
        Update: {
          acao?: string
          autor?: string
          autor_id?: string | null
          created_at?: string
          detalhe?: string | null
          entidade?: string
          id?: string
          pedido_numero?: number | null
          registro_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      insumos: {
        Row: {
          alergenos: string | null
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
          alergenos?: string | null
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
          alergenos?: string | null
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
          quantidade_do_estoque: number
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
          quantidade_do_estoque?: number
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
          quantidade_do_estoque?: number
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
          cupom_codigo: string | null
          data_entrega: string
          desconto: number
          encomenda: boolean
          endereco_entrega: string | null
          fidelidade: boolean
          forma_pagamento: string
          hora_entrega: string | null
          id: string
          lembrete_enviado_em: string | null
          numero: number
          observacoes: string | null
          origem: string
          pagamento_informado_em: string | null
          push_avisado_em: string | null
          saldo_quitado: boolean
          sinal_valor: number
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
          cupom_codigo?: string | null
          data_entrega: string
          desconto?: number
          encomenda?: boolean
          endereco_entrega?: string | null
          fidelidade?: boolean
          forma_pagamento?: string
          hora_entrega?: string | null
          id?: string
          lembrete_enviado_em?: string | null
          numero?: never
          observacoes?: string | null
          origem?: string
          pagamento_informado_em?: string | null
          push_avisado_em?: string | null
          saldo_quitado?: boolean
          sinal_valor?: number
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
          cupom_codigo?: string | null
          data_entrega?: string
          desconto?: number
          encomenda?: boolean
          endereco_entrega?: string | null
          fidelidade?: boolean
          forma_pagamento?: string
          hora_entrega?: string | null
          id?: string
          lembrete_enviado_em?: string | null
          numero?: never
          observacoes?: string | null
          origem?: string
          pagamento_informado_em?: string | null
          push_avisado_em?: string | null
          saldo_quitado?: boolean
          sinal_valor?: number
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
          excluida: boolean
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
          excluida?: boolean
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
          excluida?: boolean
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
          hora_entrega: string | null
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
          hora_entrega?: string | null
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
          hora_entrega?: string | null
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
      planos: {
        Row: {
          ativo: boolean
          descricao: string | null
          id: string
          limite_pedidos_mes: number | null
          limite_produtos: number | null
          nome: string
          ordem: number
          preco_anual: number | null
          preco_mensal: number
          recursos: string[]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          descricao?: string | null
          id: string
          limite_pedidos_mes?: number | null
          limite_produtos?: number | null
          nome: string
          ordem?: number
          preco_anual?: number | null
          preco_mensal?: number
          recursos?: string[]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          descricao?: string | null
          id?: string
          limite_pedidos_mes?: number | null
          limite_produtos?: number | null
          nome?: string
          ordem?: number
          preco_anual?: number | null
          preco_mensal?: number
          recursos?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      plataforma_admin_emails: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      plataforma_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plataforma_config: {
        Row: {
          aprovacao_manual: boolean
          cadastro_aberto: boolean
          contato_email: string | null
          contato_whatsapp: string | null
          dias_teste: number
          dias_tolerancia: number
          empresa_documento: string | null
          empresa_nome: string | null
          id: boolean
          plano_teste: string
          updated_at: string
        }
        Insert: {
          aprovacao_manual?: boolean
          cadastro_aberto?: boolean
          contato_email?: string | null
          contato_whatsapp?: string | null
          dias_teste?: number
          dias_tolerancia?: number
          empresa_documento?: string | null
          empresa_nome?: string | null
          id?: boolean
          plano_teste?: string
          updated_at?: string
        }
        Update: {
          aprovacao_manual?: boolean
          cadastro_aberto?: boolean
          contato_email?: string | null
          contato_whatsapp?: string | null
          dias_teste?: number
          dias_tolerancia?: number
          empresa_documento?: string | null
          empresa_nome?: string | null
          id?: boolean
          plano_teste?: string
          updated_at?: string
        }
        Relationships: []
      }
      plataforma_contas: {
        Row: {
          observacao: string | null
          pago_ate: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          observacao?: string | null
          pago_ate?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          observacao?: string | null
          pago_ate?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plataforma_segredos: {
        Row: {
          atualizado_em: string
          chave: string
          valor: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          valor: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          valor?: string
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "produto_midias_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          antecedencia_dias: number
          ativo: boolean
          categoria: string
          componentes: Json
          created_at: string
          custo_alterado_em: string | null
          custo_energia: number
          custo_gas: number
          custo_mao_obra: number
          descricao: string | null
          id: string
          imagem_url: string | null
          limite_dia: number | null
          margem_desejada: number
          modo_preparo: string | null
          no_catalogo: boolean
          nome: string
          opcoes: Json
          preco_venda: number
          rendimento: number
          user_id: string
          validade_dias: number | null
          venda_ate: string | null
          venda_de: string | null
        }
        Insert: {
          antecedencia_dias?: number
          ativo?: boolean
          categoria?: string
          componentes?: Json
          created_at?: string
          custo_alterado_em?: string | null
          custo_energia?: number
          custo_gas?: number
          custo_mao_obra?: number
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          limite_dia?: number | null
          margem_desejada?: number
          modo_preparo?: string | null
          no_catalogo?: boolean
          nome: string
          opcoes?: Json
          preco_venda?: number
          rendimento?: number
          user_id?: string
          validade_dias?: number | null
          venda_ate?: string | null
          venda_de?: string | null
        }
        Update: {
          antecedencia_dias?: number
          ativo?: boolean
          categoria?: string
          componentes?: Json
          created_at?: string
          custo_alterado_em?: string | null
          custo_energia?: number
          custo_gas?: number
          custo_mao_obra?: number
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          limite_dia?: number | null
          margem_desejada?: number
          modo_preparo?: string | null
          no_catalogo?: boolean
          nome?: string
          opcoes?: Json
          preco_venda?: number
          rendimento?: number
          user_id?: string
          validade_dias?: number | null
          venda_ate?: string | null
          venda_de?: string | null
        }
        Relationships: []
      }
      produtos_prontos: {
        Row: {
          produto_id: string
          quantidade: number
          updated_at: string
          user_id: string
        }
        Insert: {
          produto_id: string
          quantidade?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          produto_id?: string
          quantidade?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_prontos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_prontos_movimentos: {
        Row: {
          created_at: string
          evento_id: string
          id: string
          observacao: string | null
          pedido_id: string | null
          pedido_item_id: string | null
          pedido_numero: number | null
          produto_id: string
          produto_nome: string
          quantidade_delta: number
          reverte_evento_id: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evento_id: string
          id?: string
          observacao?: string | null
          pedido_id?: string | null
          pedido_item_id?: string | null
          pedido_numero?: number | null
          produto_id: string
          produto_nome: string
          quantidade_delta: number
          reverte_evento_id?: string | null
          tipo: string
          user_id?: string
        }
        Update: {
          created_at?: string
          evento_id?: string
          id?: string
          observacao?: string | null
          pedido_id?: string | null
          pedido_item_id?: string | null
          pedido_numero?: number | null
          produto_id?: string
          produto_nome?: string
          quantidade_delta?: number
          reverte_evento_id?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      push_inscricoes: {
        Row: {
          aparelho: string | null
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          ultimo_envio_em: string | null
          user_id: string
        }
        Insert: {
          aparelho?: string | null
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          ultimo_envio_em?: string | null
          user_id?: string
        }
        Update: {
          aparelho?: string | null
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          ultimo_envio_em?: string | null
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
      _acesso_liberado: { Args: never; Returns: boolean }
      _alocar_estoque_pronto_item: {
        Args: { p_item_id: string; p_user: string }
        Returns: number
      }
      _aplicar_opcoes: {
        Args: { p_escolha: Json; p_grupos: Json; p_nome: string }
        Returns: Record<string, unknown>
      }
      _assinatura_liberada: { Args: { p_user_id: string }; Returns: boolean }
      _autor_historico: {
        Args: { p_catalogo: boolean; p_tenant: string }
        Returns: string
      }
      _brl_texto: { Args: { v: number }; Returns: string }
      _catalogo_liberado: { Args: { p_user_id: string }; Returns: boolean }
      _conta_pagar_operacao_existente: {
        Args: {
          p_hash: string
          p_operacao_id: string
          p_tipo: string
          p_user_id: string
        }
        Returns: string
      }
      _custo_base_produto: {
        Args: { p_produto_id: string; p_user_id: string }
        Returns: number
      }
      _custo_unitario_produto: {
        Args: { p_produto_id: string; p_user_id: string }
        Returns: number
      }
      _desconto_cupom: {
        Args: {
          p_cupom: Database["public"]["Tables"]["cupons"]["Row"]
          p_hoje: string
          p_ja_comprou: boolean
          p_subtotal: number
        }
        Returns: number
      }
      _eh_admin: { Args: never; Returns: boolean }
      _encomenda_aceita: { Args: { p_slug: string }; Returns: boolean }
      _entrar_na_equipe: {
        Args: {
          p_convite: Database["public"]["Tables"]["equipe_convites"]["Row"]
          p_email: string
          p_membro: string
          p_nome: string
        }
        Returns: undefined
      }
      _exigir_dono: { Args: never; Returns: undefined }
      _gerar_codigo_curto: { Args: never; Returns: string }
      _hoje_confeitaria: { Args: never; Returns: string }
      _mover_estoque_pronto: {
        Args: {
          p_delta: number
          p_evento: string
          p_item?: string
          p_obs?: string
          p_pedido?: string
          p_pedido_numero?: number
          p_produto: string
          p_reverte?: string
          p_tipo: string
          p_user: string
        }
        Returns: number
      }
      _opcoes_validas: { Args: { p: Json }; Returns: boolean }
      _papel: { Args: never; Returns: string }
      _plano_tem: {
        Args: { p_recurso: string; p_user_id: string }
        Returns: boolean
      }
      _recalcular_resumo_conta_pagar: {
        Args: { p_conta_id: string; p_user_id: string }
        Returns: undefined
      }
      _situacao_assinatura: {
        Args: {
          p_hoje: string
          p_pago_ate: string
          p_situacao: string
          p_teste_ate: string
          p_tolerancia: number
        }
        Returns: string
      }
      _situacao_atual: { Args: { p_user_id: string }; Returns: string }
      _slug_reservado: { Args: { p_slug: string }; Returns: boolean }
      _taxa_bairro: {
        Args: { p_bairro: string; p_lista: Json }
        Returns: Record<string, unknown>
      }
      _taxas_bairro_validas: { Args: { p: Json }; Returns: boolean }
      _tenant: { Args: never; Returns: string }
      _tenant_financeiro: { Args: never; Returns: string }
      _usar_estoque_pronto_catalogo: {
        Args: { p_pedido: string; p_user: string }
        Returns: undefined
      }
      _validar_agenda_catalogo: {
        Args: {
          c: Database["public"]["Tables"]["confeitarias"]["Row"]
          p_data: string
          p_hora: string
          p_tipo: string
        }
        Returns: undefined
      }
      aceitar_convite: {
        Args: { p_nome?: string; p_token: string }
        Returns: Json
      }
      aceitar_termos: { Args: { p_versao: string }; Returns: undefined }
      acompanhar_pedido_catalogo: { Args: { p_codigo: string }; Returns: Json }
      admin_config: { Args: never; Returns: Json }
      admin_limpar_erro: { Args: { p_mensagem: string }; Returns: undefined }
      admin_listar_confeitarias: { Args: never; Returns: Json }
      admin_listar_erros: { Args: { p_dias?: number }; Returns: Json }
      admin_listar_pagamentos: { Args: { p_user_id: string }; Returns: Json }
      admin_metricas: { Args: never; Returns: Json }
      admin_registrar_pagamento: {
        Args: {
          p_forma: string
          p_meses: number
          p_observacao: string
          p_pago_em: string
          p_user_id: string
          p_valor: number
        }
        Returns: string
      }
      admin_resumo: { Args: never; Returns: Json }
      admin_salvar_empresa: {
        Args: { p: Json; p_user_id: string }
        Returns: undefined
      }
      admin_salvar_plano: { Args: { p: Json }; Returns: undefined }
      admin_salvar_plataforma: { Args: { p: Json }; Returns: undefined }
      ajustar_producao: {
        Args: {
          evento_id: string
          pedido_item_id: string
          quantidade_resultado: number
        }
        Returns: number
      }
      alterar_membro: {
        Args: { p_id: string; p_papel: string }
        Returns: undefined
      }
      avaliar_pedido: {
        Args: { p_codigo: string; p_comentario: string; p_nota: number }
        Returns: boolean
      }
      cancelar_compra: {
        Args: { evento_id: string; registro_id: string }
        Returns: boolean
      }
      cancelar_conta_pagar: {
        Args: { p_conta_id: string; p_motivo: string; p_operacao_id: string }
        Returns: string
      }
      cancelar_convite: { Args: { p_id: string }; Returns: undefined }
      catalogo_publico: { Args: { p_slug: string }; Returns: Json }
      codigo_curto_pedido: { Args: { p_codigo: string }; Returns: string }
      confirmar_ocorrencia_recorrente: {
        Args: { p_itens: Json; p_ocorrencia_id: string; p_payload: Json }
        Returns: string
      }
      convidar_membro: {
        Args: { p_email: string; p_papel: string }
        Returns: Json
      }
      corrigir_valor_pago_pedido_com_producao: {
        Args: { p_pedido_id: string; p_valor_pago: number }
        Returns: Json
      }
      criar_encomenda_catalogo: {
        Args: {
          p_cliente: Json
          p_encomenda: Json
          p_slug: string
          p_token: string
        }
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
      descartar_estoque_pronto: {
        Args: {
          p_evento_id: string
          p_observacao?: string
          p_produto_id: string
          p_quantidade: number
        }
        Returns: number
      }
      desfazer_producao_estoque: {
        Args: { p_evento_id: string; p_producao_evento_id: string }
        Returns: number
      }
      editar_conta_pagar_parcelada: {
        Args: {
          p_operacao_id: string
          p_parcelamento_id: string
          p_valor_total: number
        }
        Returns: boolean
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
      eh_admin_plataforma: { Args: never; Returns: boolean }
      endereco_cardapio_publico: { Args: { p_slug: string }; Returns: string }
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
      excluir_pedidos_recorrentes: {
        Args: { p_cliente_id?: string; p_recorrencia_id?: string }
        Returns: number
      }
      informar_pagamento_catalogo: {
        Args: { p_codigo: string }
        Returns: boolean
      }
      informar_pagamento_pedido: {
        Args: { p_codigo: string }
        Returns: boolean
      }
      medida_base: { Args: { u: string }; Returns: string }
      medida_fator: { Args: { u: string }; Returns: number }
      meu_papel: { Args: never; Returns: Json }
      minha_assinatura: { Args: never; Returns: Json }
      pedido_publico: { Args: { p_codigo: string }; Returns: Json }
      plataforma_publica: { Args: never; Returns: Json }
      preparar_ocorrencia_recorrente: {
        Args: {
          p_data_entrega: string
          p_hora_entrega: string
          p_itens: Json
          p_observacoes: string
          p_recorrencia_id: string
        }
        Returns: string
      }
      progresso_fidelidade: {
        Args: { p_slug: string; p_telefone: string }
        Returns: Json
      }
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
      registrar_conta_pagar_parcelada: {
        Args: {
          p_dados: Json
          p_numero_parcelas: number
          p_operacao_id: string
          p_primeiro_vencimento: string
        }
        Returns: boolean
      }
      registrar_erro: {
        Args: {
          p_agente: string
          p_detalhe: string
          p_mensagem: string
          p_origem: string
          p_url: string
        }
        Returns: undefined
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
      registrar_producao_estoque: {
        Args: {
          p_evento_id: string
          p_observacao?: string
          p_produto_id: string
          p_quantidade: number
        }
        Returns: number
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
      sair_da_equipe: { Args: never; Returns: undefined }
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
      salvar_inscricao_push: {
        Args: {
          p_aparelho: string
          p_auth: string
          p_endpoint: string
          p_p256dh: string
        }
        Returns: undefined
      }
      salvar_midias_produto: {
        Args: { p_midias: Json; p_produto_id: string }
        Returns: number
      }
      salvar_pedido: {
        Args: { itens: Json; payload: Json; registro_id?: string }
        Returns: string
      }
      salvar_produto: {
        Args: { itens: Json; payload: Json; registro_id?: string }
        Returns: string
      }
      usar_estoque_pronto_item: { Args: { p_item_id: string }; Returns: number }
      validar_cupom_catalogo: {
        Args: {
          p_codigo: string
          p_slug: string
          p_subtotal: number
          p_telefone: string
        }
        Returns: Json
      }
      ver_convite: { Args: { p_token: string }; Returns: Json }
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
