-- Script para configurar la tabla de partidas multijugador en Supabase

-- 1. Crear la tabla multiplayer_games
CREATE TABLE public.multiplayer_games (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player1_id UUID REFERENCES auth.users(id) NOT NULL,
    player2_id UUID REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
    game_state JSONB,
    winner_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.multiplayer_games ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de seguridad (RLS)
-- Permitir a cualquier usuario autenticado leer todas las partidas (para ver el lobby)
CREATE POLICY "Permitir lectura a usuarios autenticados" 
ON public.multiplayer_games 
FOR SELECT 
TO authenticated 
USING (true);

-- Permitir a los usuarios autenticados crear partidas
CREATE POLICY "Permitir crear partidas" 
ON public.multiplayer_games 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = player1_id);

-- Permitir a los jugadores involucrados actualizar la partida
CREATE POLICY "Permitir actualizar a los jugadores de la partida" 
ON public.multiplayer_games 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = player1_id OR auth.uid() = player2_id)
WITH CHECK (auth.uid() = player1_id OR auth.uid() = player2_id);

-- 4. Habilitar Supabase Realtime para esta tabla
-- Esto permite escuchar cambios en tiempo real desde Angular
alter publication supabase_realtime add table public.multiplayer_games;
