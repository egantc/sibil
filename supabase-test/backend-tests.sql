begin; set local role service_role;
do $test$
declare v_actor uuid:=gen_random_uuid(); sess uuid:=gen_random_uuid(); cid uuid; b jsonb; out1 jsonb; out2 jsonb; rid uuid; v integer; s text; blocked boolean;
begin
 select id into cid from sibil_test.customers order by sort_no limit 1;
 select version into v from sibil_test.statuses where customer_id=cid and year=2026 and month=1;
 foreach s in array array['CASH','TRANSFER','DISCOUNT','UNPAID'] loop
  rid:=gen_random_uuid(); b:=jsonb_build_object('customer_id',cid,'month',1,'status',s,'version',v,'request_id',rid);
  out1:=public.sibil_test_api(v_actor,sess,'ekoprabowojob@gmail.com','update',b);
  out2:=public.sibil_test_api(v_actor,sess,'ekoprabowojob@gmail.com','update',b);
  if out1<>out2 then raise exception 'Retry response changed'; end if;
  if (select version from sibil_test.statuses where customer_id=cid and year=2026 and month=1)<>v+1 then raise exception 'Retry applied twice'; end if;
  if (select count(*) from sibil_test.audit a where a.request_id=rid and a.actor=v_actor)<>1 then raise exception 'Audit duplicate'; end if;
  v:=v+1;
 end loop;
 blocked:=false;
 begin perform public.sibil_test_api(v_actor,sess,'ekoprabowojob@gmail.com','update',b||jsonb_build_object('request_id',gen_random_uuid()));
 exception when serialization_failure then blocked:=true; end;
 if not blocked then raise exception 'Stale write accepted'; end if;
 blocked:=false;
 begin perform public.sibil_test_api(v_actor,sess,'ekoprabowojob@gmail.com','update',b||jsonb_build_object('status','CASH'));
 exception when serialization_failure then blocked:=true; end;
 if not blocked then raise exception 'Reused ID changed input accepted'; end if;
 b:=jsonb_build_object('name','Synthetic staging test','request_id',gen_random_uuid());
 out1:=public.sibil_test_api(v_actor,sess,'ekoprabowojob@gmail.com','addCustomer',b);
 out2:=public.sibil_test_api(v_actor,sess,'ekoprabowojob@gmail.com','addCustomer',b);
 if out1<>out2 then raise exception 'Add retry failed'; end if;
 if (select count(*) from sibil_test.statuses where customer_id=(out1->>'id')::uuid)<>12 then raise exception 'Missing initial monthly rows'; end if;
 blocked:=false;
 begin perform public.sibil_test_api(v_actor,sess,'other@example.invalid','dashboard','{}');
 exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Wrong admin accepted'; end if;
 perform public.sibil_test_api(v_actor,sess,'ekoprabowojob@gmail.com','logout','{}');
 blocked:=false;
 begin perform public.sibil_test_api(v_actor,sess,'ekoprabowojob@gmail.com','dashboard','{}');
 exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Revoked session accepted'; end if;
end $test$;
set constraints all immediate;
select 'PASS: RPC mutations, audit, replay, conflicts, add, admin denial, logout revocation' as result;
rollback;

