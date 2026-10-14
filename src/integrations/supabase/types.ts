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
          created_at: string
          data_compra: string
          estoque_integrado: boolean
          id: string
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          data_compra: string
          estoque_integrado?: boolean
          id?: string
          total?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          data_compra?: string
          estoque_integrado?: boolean
          id?: string
          total?: number
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
      salvar_compra: {
        Args: { evento_id?: string; itens: Json; payload: Json; registro_id?: string }
        Returns: string
      }
      medida_base: { Args: { u: string }; Returns: string }
      medida_fator: { Args: { u: string }; Returns: number }
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
