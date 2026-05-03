import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UNIQUE_ORG_ID = "a0000000-0000-0000-0000-000000000001";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [clients, demands, scheduled, team, ideas, news, checkins, events] = await Promise.all([
      sb.from("clients").select("id,name,contact_name,plan,monthly_value,status,score,segment,access_code").eq("org_id", UNIQUE_ORG_ID).order("created_at", { ascending: false }),
      sb.from("demands").select("id,title,stage,priority,client_id,format,networks,sponsored,schedule_date,created_at").eq("org_id", UNIQUE_ORG_ID).order("created_at", { ascending: false }).limit(40),
      sb.from("scheduled_posts").select("id,client_id,caption,scheduled_at,status,platform,media_type,published_at").order("scheduled_at", { ascending: false }).limit(30),
      sb.from("agency_members").select("id,name,email,job_title,role,status,xp_points,streak_days"),
      sb.from("ideas").select("id,title,description,author,client_name,tags,votes,status,created_at").eq("org_id", UNIQUE_ORG_ID).order("created_at", { ascending: false }).limit(15),
      sb.from("news").select("id,title,summary,category,author,pinned,created_at,read_time,tags,photo").eq("org_id", UNIQUE_ORG_ID).order("created_at", { ascending: false }).limit(10),
      sb.from("checkins").select("id,user_id,check_in_at,check_out_at").order("check_in_at", { ascending: false }).limit(30),
      sb.from("events").select("id,title,type,date,time,client_name,description,color,completed").eq("org_id", UNIQUE_ORG_ID).gte("date", new Date().toISOString().slice(0,10)).order("date", { ascending: true }).limit(15)
    ]);

    const totalRevenue = (clients.data || []).filter((c: any) => c.status === "ativo").reduce((a: number, c: any) => a + (Number(c.monthly_value) || 0), 0);
    const activeClients = (clients.data || []).filter((c: any) => c.status === "ativo").length;
    const trialClients = (clients.data || []).filter((c: any) => c.status === "trial").length;
    const demandsByStage = (demands.data || []).reduce((acc: any, d: any) => { acc[d.stage] = (acc[d.stage] || 0) + 1; return acc; }, {});
    const pendingApprovals = demandsByStage["approval"] || demandsByStage["review"] || 0;
    const postsByStatus = (scheduled.data || []).reduce((acc: any, p: any) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});

    /* Enrich demands with client names (small in-memory join) */
    const clientMap: any = {};
    (clients.data || []).forEach((c: any) => { clientMap[c.id] = c.name; });
    const demandsEnriched = (demands.data || []).map((d: any) => ({ ...d, client_name: clientMap[d.client_id] || null }));
    const scheduledEnriched = (scheduled.data || []).map((p: any) => ({ ...p, client_name: clientMap[p.client_id] || null }));

    return new Response(
      JSON.stringify({
        org: { id: UNIQUE_ORG_ID, name: "Unique Marketing 360" },
        stats: {
          total_revenue: totalRevenue,
          active_clients: activeClients,
          trial_clients: trialClients,
          total_clients: (clients.data || []).length,
          demands_by_stage: demandsByStage,
          pending_approvals: pendingApprovals,
          posts_by_status: postsByStatus,
          team_size: (team.data || []).length,
          total_demands: (demands.data || []).length,
          scheduled_posts_count: (scheduled.data || []).length
        },
        clients: clients.data || [],
        demands: demandsEnriched,
        scheduled_posts: scheduledEnriched,
        team: team.data || [],
        ideas: ideas.data || [],
        news: news.data || [],
        checkins: checkins.data || [],
        events: events.data || [],
        errors: {
          clients: clients.error?.message,
          demands: demands.error?.message,
          scheduled: scheduled.error?.message,
          team: team.error?.message,
          ideas: ideas.error?.message,
          news: news.error?.message,
          checkins: checkins.error?.message,
          events: events.error?.message
        }
      }),
      { headers: corsHeaders }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { headers: corsHeaders });
  }
});
