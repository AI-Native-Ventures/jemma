# Jemma: text description

Track: learner profiling. Live link: to be announced. Code repository: to be announced. Licence: to be announced.

Teachers mark a lot of tests. They rarely have time to find out why each child got an answer wrong, and parents are left to guess how to help at home. Jemma tries to close that gap.

The teacher uploads the curriculum and photographs a class test. Jemma reads each paper, marks it, and works out why each wrong answer is wrong. It builds a learner profile for every child: marks by topic, gaps and their stage, teacher notes, attendance, activities and a guidance card. It tells the teacher what to reteach to the class. For each child it plans a short home lesson on their biggest gap, in reading cards, a diagram or an audio memo. The parent hands the phone over, the child works through the lesson and never sees a score, and Jemma updates the gap afterwards. It also records which format works for each child, and says "Too early to tell" until it has three sessions to go on.

Jemma has its own MCP server with 20 tools. Seven read tools hand over the inputs, and the rest save results. These tools read or change the profile: `get_learner_profile`, `update_learner_profile`, `class_gap_report`, `plan_next_session`, `subject_guidance` and `mark_paper`. The tools never call a model. A model reads a photo or writes a lesson, then passes its answer to a save tool. The save tool checks the shape, applies the rules in code and writes. Code decides every mark and every gap.

The AI work runs in two ways. The cloud runner uses free models. Jemma Desktop uses the teacher's or parent's own Claude Code or Codex through the same MCP server.

Safety rules: photo and upload text is treated as data, never as instructions. Anything Jemma is unsure about goes to the teacher. Parents see a child only after the teacher agrees. All data in the demo is made up.

Limits: English and Maths only, Grade 6 data, free models are slow when an answer is not stored yet.
