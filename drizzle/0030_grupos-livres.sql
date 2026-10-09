create type plan_group_kind as enum ('revenue','expense','investment','financing','partners');--> statement-breakpoint
alter table expense_groups rename to plan_groups;--> statement-breakpoint
alter index expense_groups_farm_name_idx rename to plan_groups_farm_name_idx;--> statement-breakpoint
alter table plan_groups rename constraint expense_groups_pkey to plan_groups_pkey;--> statement-breakpoint
alter table plan_groups rename constraint expense_groups_farm_id_farm_id_fk to plan_groups_farm_id_farm_id_fk;--> statement-breakpoint
alter table plan_groups add column kind plan_group_kind not null default 'expense';--> statement-breakpoint
alter table plan_groups alter column kind drop default;--> statement-breakpoint
alter table plan_groups add column legacy_key text;--> statement-breakpoint
insert into plan_groups (id, farm_id, kind, name, legacy_key)
select gen_random_uuid()::text, f.id, k.kind::plan_group_kind, k.name, k.key
from farm f cross join (values
  ('revenue','revenue','Receitas'),
  ('nutrition','expense','Nutrição'), ('pasture','expense','Pastagem'),
  ('labor','expense','Mão de obra'), ('health','expense','Sanidade'),
  ('breeding','expense','Reprodução'), ('admin','expense','Administrativo'),
  ('other','expense','Outros'),
  ('investment','investment','Investimentos'),
  ('financing','financing','Financiamentos'),
  ('partners','partners','Sócios')
) as k(key, kind, name);--> statement-breakpoint
update accounts a set "group" = g.id
  from plan_groups g where g.farm_id = a.farm_id and g.legacy_key = a."group";--> statement-breakpoint
update expenses e set category = g.id
  from plan_groups g where g.farm_id = e.farm_id and e.kind <> 'yield'
  and g.legacy_key = case when e.kind = 'expense' then e.category else e.kind::text end;--> statement-breakpoint
update expense_series s set category = g.id
  from plan_groups g where g.farm_id = s.farm_id
  and g.legacy_key = case when s.kind = 'expense' then s.category else s.kind::text end;--> statement-breakpoint
update budgets b set category = g.id
  from plan_groups g where g.farm_id = b.farm_id and g.legacy_key = b.category;--> statement-breakpoint
alter table expenses alter column category drop not null;--> statement-breakpoint
update expenses set category = null where kind = 'yield';--> statement-breakpoint
alter table plan_groups drop column legacy_key;--> statement-breakpoint
alter table semen_purchases drop column expense_id;
