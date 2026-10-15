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
      contas_pagar: {
        Row: {
          cancelada_em: string | null
          compra_id: string | null
          created_at: string
          data_emissao: string
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          fornecedor: string | null
          forma_pagamento: string | null
          gerada_automaticamente: boolean
          compra_parcela_numero: number | null
          compra_parcelas_total: number | null
          id: string
          motivo_cancelamento: string | null
          observacoes: string | null
          status: string
          updated_at: string
          user_id: string
          valor: number
          valor_pago: number
        }
        Insert: {
          cancelada_em?: string | null
          compra_id?: string | null
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao: string
          fornecedor?: string | null
          forma_pagamento?: string | null
          gerada_automaticamente?: boolean
          compra_parcela_numero?: number | null
          compra_parcelas_total?: number | null
          id?: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valor: number
          valor_pago?: number
        }
        Update: {
          cancelada_em?: string | null
          compra_id?: string | null
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          fornecedor?: string | null
          forma_pagamento?: string | null
          gerada_automaticamente?: boolean
          compra_parcela_numero?: number | null
          compra_parcelas_total?: number | null
          id?: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
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
            foreignKeyName: "contas_pagar_estornos_pagamento_id_conta_id_user_id_fkey"
            columns: ["pagamento_id", "conta_id", "user_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_pagamentos"
            referencedColumns: ["id", "conta_id", "user_id"]
          },
          {
            foreignKeyName: "contas_pagar_estornos_conta_id_user_id_fkey"
            columns: ["conta_id", "user_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id", "user_id"]
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
        Relationships: []
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
        Relationships: []
      }
      configuracoes: {
        Row: {
          imposto_pct: number
          taxa_credito: number
          taxa_debito: number
          taxa_dinheiro: number
          taxa_outros: number
          taxa_pix: number
          user_id: string
        }
        Insert: {
          imposto_pct?: number
          taxa_credito?: number
          taxa_debito?: number
          taxa_dinheiro?: number
          taxa_outros?: number
          taxa_pix?: number
          user_id?: string
        }
        Update: {
          imposto_pct?: number
          taxa_credito?: number
          taxa_debito?: number
          taxa_dinheiro?: number
          taxa_outros?: number
          taxa_pix?: number
          user_id?: string
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
      insumos: {
        Row: {
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
      pedidos: {
        Row: {
          cliente_id: string | null
          created_at: string
          data_entrega: string
          desconto: number
          forma_pagamento: string
          hora_entrega: string | null
          id: string
          numero: number
          observacoes: string | null
          saldo_quitado: boolean
          status: string
          taxa_entrega: number
          user_id: string
          valor_entrada: number
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          data_entrega: string
          desconto?: number
          forma_pagamento?: string
          hora_entrega?: string | null
          id?: string
          numero?: never
          observacoes?: string | null
          saldo_quitado?: boolean
          status?: string
          taxa_entrega?: number
          user_id?: string
          valor_entrada?: number
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          data_entrega?: string
          desconto?: number
          forma_pagamento?: string
          hora_entrega?: string | null
          id?: string
          numero?: never
          observacoes?: string | null
          saldo_quitado?: boolean
          status?: string
          taxa_entrega?: number
          user_id?: string
          valor_entrada?: number
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
      produtos: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          custo_alterado_em: string | null
          custo_energia: number
          custo_gas: number
          custo_mao_obra: number
          id: string
          margem_desejada: number
          modo_preparo: string | null
          nome: string
          preco_venda: number
          rendimento: number
          user_id: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          custo_alterado_em?: string | null
          custo_energia?: number
          custo_gas?: number
          custo_mao_obra?: number
          id?: string
          margem_desejada?: number
          modo_preparo?: string | null
          nome: string
          preco_venda?: number
          rendimento?: number
          user_id?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          custo_alterado_em?: string | null
          custo_energia?: number
          custo_gas?: number
          custo_mao_obra?: number
          id?: string
          margem_desejada?: number
          modo_preparo?: string | null
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
      ajustar_producao: {
        Args: { pedido_item_id: string; quantidade_resultado: number; evento_id: string }
        Returns: number
      }
      cancelar_compra: {
        Args: { registro_id: string; evento_id: string }
        Returns: boolean
      }
      excluir_compra: {
        Args: { registro_id: string; evento_id: string }
        Returns: boolean
      }
      cancelar_conta_pagar: {
        Args: { p_conta_id: string; p_motivo: string; p_operacao_id: string }
        Returns: string
      }
      estornar_pagamento_conta_pagar: {
        Args: { p_pagamento_id: string; p_valor: number; p_motivo: string; p_operacao_id: string }
        Returns: string
      }
      registrar_pagamento_conta_pagar: {
        Args: {
          p_conta_id: string
          p_valor: number
          p_data_pagamento: string
          p_forma_pagamento: string
          p_observacoes: string | null
          p_operacao_id: string
        }
        Returns: string
      }
      salvar_conta_pagar: {
        Args: { p_dados: Json; p_conta_id?: string | null; p_operacao_id?: string | null }
        Returns: string
      }
      medida_base: { Args: { u: string }; Returns: string }
      medida_fator: { Args: { u: string }; Returns: number }
      recalcular_custos_historicos: { Args: Record<PropertyKey, never>; Returns: number }
      registrar_inventario_fisico: { Args: { itens: Json; evento_id: string }; Returns: boolean }
      registrar_local_compra: { Args: { registro_id: string; local_compra: string | null }; Returns: undefined }
      registrar_pagamento_compra: { Args: { p_compra_id: string; p_forma_pagamento: string; p_numero_parcelas?: number; p_primeiro_vencimento?: string }; Returns: boolean }
      saldo_estoque: {
        Args: Record<PropertyKey, never>
        Returns: { insumo_id: string; nome: string; unidade_base: string | null; saldo: number }[]
      }
      salvar_compra: {
        Args: { payload: Json; itens: Json; registro_id?: string | null; evento_id?: string | null }
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
