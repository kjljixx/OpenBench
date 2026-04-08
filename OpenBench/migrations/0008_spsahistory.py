from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('OpenBench', '0007_remove_test_spsa'),
    ]

    operations = [
        migrations.CreateModel(
            name='SPSAHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('games', models.IntegerField(default=0)),
                ('iteration', models.FloatField(default=0.0)),
                ('values', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('spsa_run', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='history', to='OpenBench.spsarun')),
            ],
        ),
    ]
