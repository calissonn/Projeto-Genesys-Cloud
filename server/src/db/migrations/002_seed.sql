-- Departamentos iniciais (editáveis na Administração).
INSERT INTO department (id, name, short_name) VALUES
  ('loja-fisica', 'Loja Física', 'Loja Física'),
  ('ecommerce', 'Loja Online / E-commerce', 'E-commerce'),
  ('gazinbank', 'GazinBank', 'GazinBank'),
  ('consorcio', 'Consórcio', 'Consórcio'),
  ('seguros', 'Seguros', 'Seguros'),
  ('sac', 'SAC / Assistência', 'SAC'),
  ('filiais', 'Filiais e Representantes', 'Filiais')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_setting (key, value, updated_by) VALUES
  ('goals', '{"disconnectWarn":15,"disconnectCrit":20,"selfServiceTarget":30,"transferMax":55,"authFailureWarn":16,"authFailureCrit":22,"stepDisconnectWarn":6,"stepDisconnectCrit":12}', 'sistema')
ON CONFLICT (key) DO NOTHING;
